import { v5 as uuidv5 } from 'uuid';
import axios from 'axios';
import { formulaBussinessMapping, headerBussinessMapping, isHeader } from '../AI/gemini';
import { createEmbedding } from "../AI/openai"
import { refreshToken } from '../credentials/credential';
import { insertPoints, removePoints } from '../vector/qdrand';
import { embeedSheet } from '../queue.ts/queue';
import { createMetaData, createOrUpdateSpreadsheetMetaData, getSpreadsheetMetaData } from '../model/storeMetaData';
import { sheetJobModel, updateSheetJobData } from '../model/sheetsJob';
import { Job } from 'bullmq';
import emitter, { CHANNEL } from '../emitter';
import { Cell, RequestConfig, TableBlock, TableRegion, Headers, Spreadsheet, SheetTitle, GetSheetDataPayload, EmbeedSheetDataPayload, SheetsDetails, SpreadsheetMetadata } from '../types';
import crypto from "crypto";
import { CellIndexModel } from '../model/cellIndex';


const createHash = async (data: any) => {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash("sha256").update(serialized).digest("hex");
}

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // constant namespace

export function makePointId(spreadsheetId: string, sheetName: string, location: string): string {
    return uuidv5(`${spreadsheetId}:${sheetName}:${location}`, NAMESPACE);
}

const getCellAddress = (row: number, col: number): string => {
    let letters = '';
    let n = col;
    while (n >= 0) {
        letters = String.fromCharCode((n % 26) + 65) + letters;
        n = Math.floor(n / 26) - 1;
    }
    return `${letters}${row + 1}`;
}

const fetchSheetAs2DObjects = async (spreadsheetId: string, requestHeaders: RequestConfig['headers'], sheetName: string) => {
    const GET_VALUES = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}?valueRenderOption=UNFORMATTED_VALUE`;
    const GET_FORMULAS = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}?valueRenderOption=FORMULA`;

    const [response1, response2] = await Promise.all([
        axios.get(GET_VALUES, { headers: requestHeaders }),
        axios.get(GET_FORMULAS, { headers: requestHeaders }),
    ]);

    const values = response1.data.values || [];
    const formulas = response2.data.values || [];

    const rowCount = Math.max(values.length, formulas.length);
    const colCount = Math.max(
        ...[...values, ...formulas].map(row => row.length || 0)
    );

    const result: Cell[][] = [];

    for (let r = 0; r < rowCount; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < colCount; c++) {
            const location = getCellAddress(r, c);
            const value = values?.[r]?.[c] ?? null;
            const formula = formulas?.[r]?.[c];
            row.push({
                location,
                value,
                formula: (typeof formula === 'string' && formula.startsWith('=')) ? formula : null,
                sheetName,
                pointId: await makePointId(spreadsheetId, sheetName, location)
            });
        }
        result.push(row);
    }

    return result;
}

const extractHeaders = (parsed: Cell[][], table: TableBlock) => {
    const headers = {
        horizontal: [] as Cell[],
        vertical: [] as Cell[]
    };

    for (const rowIdx of table.horizontalHeaders ?? []) {
        headers.horizontal = parsed[rowIdx].slice(table.startCol, table.endCol + 1);
    }

    for (let r = table.startRow; r <= table.endRow; r++) {
        for (const colIdx of table.verticalHeaders ?? []) {
            headers.vertical.push(parsed[r][colIdx]);
        }
    }

    return headers;
}


const detectTablesWithHeaders = (parsed: Cell[][]): TableRegion[] => {
    const rows = parsed.length;
    const cols = Math.max(...parsed.map(row => row.length));

    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const tables: TableRegion[] = [];

    function bfs(startR: number, startC: number) {
        const queue = [[startR, startC]];
        let minR = startR, maxR = startR;
        let minC = startC, maxC = startC;

        while (queue.length > 0) {
            const [r, c] = queue.shift()!;
            if (r < 0 || c < 0 || r >= rows || c >= parsed[r]?.length || visited[r][c]) continue;

            const cell = parsed[r]?.[c];
            if (!cell || (cell.value === null || cell.value === "")) return;

            visited[r][c] = true;
            minR = Math.min(minR, r);
            maxR = Math.max(maxR, r);
            minC = Math.min(minC, c);
            maxC = Math.max(maxC, c);

            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr;
                const nc = c + dc;
                if (
                    nr >= 0 && nr < rows &&
                    nc >= 0 && nc < parsed[nr]?.length &&
                    !visited[nr][nc] &&
                    parsed[nr][nc] &&
                    parsed[nr][nc].value !== null &&
                    parsed[nr][nc].value !== ""
                ) {
                    queue.push([nr, nc]);
                }
            }
        }

        return { minR, maxR, minC, maxC };
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < parsed[r]?.length; c++) {
            if (
                !visited[r][c] &&
                parsed[r][c] &&
                parsed[r][c].value !== null &&
                parsed[r][c].value !== ""
            ) {
                const box = bfs(r, c);
                if (!box) continue;

                const { minR, maxR, minC, maxC } = box;

                // Detect horizontal header
                let headerRow: number | null = null;
                for (let hr = minR; hr <= maxR; hr++) {
                    const row = parsed[hr]?.slice(minC, maxC + 1);
                    const nonEmptyCount = row.filter(cell => cell?.value !== null && typeof cell.value === "string").length;
                    const numCells = row.length;
                    if (nonEmptyCount > 0 && nonEmptyCount >= Math.floor(numCells / 2)) {
                        headerRow = hr;
                        break;
                    }
                }

                // Detect vertical header
                let headerCol: number | null = null;
                for (let hc = minC; hc <= maxC; hc++) {
                    let nonEmpty = 0;
                    for (let rr = minR; rr <= maxR; rr++) {
                        const val = parsed[rr]?.[hc]?.value;
                        if (val !== null && typeof val === "string") nonEmpty++;
                    }
                    if (nonEmpty >= Math.floor((maxR - minR + 1) / 2)) {
                        headerCol = hc;
                        break;
                    }
                }

                tables.push({
                    startRow: minR,
                    endRow: maxR,
                    startCol: minC,
                    endCol: maxC,
                    horizontalHeaders: headerRow !== null ? [headerRow] : [],
                    verticalHeaders: headerCol !== null ? [headerCol] : [],
                });
            }
        }
    }

    return tables;
}

/**
 * Normalize a formula by replacing row numbers with '#' and optional header mapping
 * e.g. =IF(D2<>"",D2/C2,"") => =IF(D#<>"",D#/C#,"")
 */
const normalizeFormula = (formula: string) => {
    if (!formula) return null;

    // Replace row numbers with #
    return formula?.replace(/([A-Z]+)[0-9]+/g, '$1#').trim();
}

const extractSheetNames = (formula: string): string[] => {
    const regex = /(?:'([^']+)'|([A-Za-z0-9_]+))!/g;
    const sheetNames = new Set<string>();

    let match;
    while ((match = regex.exec(formula)) !== null) {
        const name = match[1] || match[2];
        if (name) sheetNames.add(name);
    }

    return [...sheetNames];
}


const groupFormulasByStructure = async (parsed2DArray: Cell[][]) => {
    const formulaMap = new Map<string, string[]>(); // { formula => [locations] }
    const externalSheetSet = new Set<string>();

    for (const row of parsed2DArray) {
        for (const cell of row) {
            if (cell.formula) {
                const normalized = normalizeFormula(cell.formula);

                // Track cell location by normalized formula
                if (!formulaMap.has(normalized ?? " ")) {
                    formulaMap.set(normalized ?? "", []);
                }
                formulaMap?.get(normalized ?? "")?.push(cell.location);

                // Track any external sheets used
                const sheets = extractSheetNames(cell.formula);
                console.log(sheets)
                for (const sheet of sheets) {
                    console.log(sheet !== cell.sheetName, "hjk")
                    if (sheet !== cell.sheetName) {
                        externalSheetSet.add(sheet);
                    }
                }
            }
        }
    }

    const formulaGroups = Array.from(formulaMap.entries()).map(([formula, cells]) => ({
        formula,
        cells
    }));

    const externalSheets = [...externalSheetSet];
    console.log(externalSheets)

    return { formulaGroups, externalSheets };
}


const getCellHeaders = (cellLocation: any, headers: any) => {
    const match = cellLocation.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const [_, col, rowStr] = match;
    const row = parseInt(rowStr, 10);

    // @ts-expect-error
    const horizontal = headers?.horizontal?.find(h => {
        const [hCol, hRow] = h.location.match(/^([A-Z]+)(\d+)$/).slice(1);
        return hCol === col && parseInt(hRow, 10) < row;
    });

    // @ts-expect-error
    const vertical = headers?.vertical?.find(h => {
        const [hCol, hRow] = h.location.match(/^([A-Z]+)(\d+)$/).slice(1);
        return parseInt(hRow, 10) === row && hCol < col;
    });

    return {
        ...(horizontal ? { horizontal } : {}),
        ...(vertical ? { vertical } : {})
    };
}



const flattenSemanticData = (cell: any) => {
    const {
        value,
        formula,
        location,
        sheetName,
        headerCell,
        formulaDescription,
        semanticFormula,
    } = cell;
    const headerValue = headerCell?.horizontal?.value
    const headerFormula = headerCell?.horizontal?.formula
    const headerLocation = headerCell?.horizontal?.location
    const headerSheet = headerCell?.horizontal?.sheetName

    const concept = headerCell?.horizontal?.concept
    const description = headerCell?.horizontal?.description
    const metricType = headerCell?.horizontal?.metricType
    const synonyms = headerCell?.horizontal?.synonyms

    //

    const verticalHeaderValue = headerCell?.vertical?.value
    const verticalHeaderFormula = headerCell?.vertical?.formula
    const verticalHeaderLocation = headerCell?.vertical?.location
    const verticalHeaderSheet = headerCell?.vertical?.sheetName

    const verticalConcept = headerCell?.vertical?.concept
    const verticalDescription = headerCell?.vertical?.description
    const verticalMetricType = headerCell?.vertical?.metricType
    const verticalSynonyms = headerCell?.vertical?.synonyms

    // Combine all semantic fields into a single string
    const semanticText = `
    Sheet: ${sheetName}
    Cell Location: ${location}
    Cell Value: ${value}
    Cell Formula: ${formula || 'N/A'}

    Header: ${headerValue}
    Concept: ${concept}
    Description: ${description}
    Header Formula: ${headerFormula || 'N/A'}
    Metric Type: ${metricType}
    Synonyms: ${synonyms?.join(', ') || 'None'}
    Header Location: ${headerLocation}
    Header Sheet: ${headerSheet}
    formula description: ${formulaDescription},
    semantic formula: ${semanticFormula}
    verticalHeaderValue: ${verticalHeaderValue},
    verticalHeaderFormula: ${verticalHeaderFormula},
    verticalHeaderLocation: ${verticalHeaderLocation},
    verticalHeaderSheet: ${verticalHeaderSheet},
    verticalConcept: ${verticalConcept},
    verticalDescription: ${verticalDescription},
    verticalMetricType: ${verticalMetricType},
    verticalSynonyms: ${verticalSynonyms}
  `.trim();

    const formulaPart = formula ? ` The formula in this cell is: "${formula}".  formula description: ${formulaDescription}, semantic formula: ${semanticFormula}` : '';
    const synonymsPart = synonyms?.length > 0
        ? ` Related terms include: ${synonyms.join(', ')}.`
        : '';

    // Construct a natural language paragraph
    const paragraph = `This is the value "${value}" located at cell ${location} under the header "${headerValue}" ${(verticalHeaderValue ? 'verticalHeaderValue' + verticalHeaderValue : '')} in the "${sheetName}" sheet. This header corresponds to the concept "${concept}" ${verticalConcept ? ('verticalHeaderConcept' + verticalConcept) : ''}, which ${description?.toLowerCase()} It is categorized as a ${metricType + (verticalMetricType ?? "")}.${formulaPart}${synonymsPart + (verticalSynonyms ?? '')}`;

    return `${semanticText}, ${paragraph}`;
}

export const embedCell = async (cells: Cell[], sheetId: string, spreadSheetName: string, isLastRow: boolean, jobId: string) => {

    const payload = await Promise.all(cells.map(async (c) => {
        const vector = await createEmbedding(c.para)
        return { id: c.pointId, payload: { ...c, sheetId, spreadSheetName }, vector }
    }))

    await insertPoints(payload)
    if (isLastRow && jobId) {
        const jobData = await updateSheetJobData(jobId, { status: 'success', completedAt: new Date() })
        emitter.emit(CHANNEL, jobData)
    }

}

const flattHeaders = (originalHeaders: Headers[]) => {
    return originalHeaders.flatMap(headerGroup => [
        ...headerGroup.horizontal.map(cell => ({ ...cell, layout: "horizontal" })),
        ...headerGroup.vertical.map(cell => ({ ...cell, layout: "vertical" }))
    ]);
}
const unflattenHeaders = (flatHeaders: Cell[]) => {
    console.log("flatHeaders123", flatHeaders)
    return [
        {
            horizontal: flatHeaders?.filter(c => c.layout === "horizontal") ?? [],
            vertical: flatHeaders?.filter(c => c.layout === "vertical") ?? []
        }
    ];
}

const fetchSpreadsheetMetadata = async (spreadsheetId: string, headers: RequestConfig['headers']): Promise<Spreadsheet> => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const { data } = await axios.get<Spreadsheet>(url, { headers, }) ?? {};
    return data;
}


const reconcileDeletions = async (spreadsheetId: string, allPointIds: string[], job: Job): Promise<void> => {
    const notExisting = await CellIndexModel.find({ spreadsheetId, pointId: { $nin: allPointIds } })
        .lean()
        .select({ pointId: 1, location: 1 });
    console.log('notExisting', notExisting.map((n) => n.location));

    if (notExisting.length > 0) {
        const notExistingIds = notExisting.map((n) => n.pointId);
        await removePoints(notExistingIds).catch((err) => console.error('Error removing points from Qdrant:', err));
        await CellIndexModel.deleteMany({ pointId: { $in: notExistingIds } }).catch((err) => console.error('Error deleting from CellIndexModel:', err));
        console.log(`Deleted ${notExisting.length} obsolete cells from Qdrant and MongoDB`);
    }
};

const updateSheetMetadata = async (finalData: SheetsDetails[], spreadsheetId: string, spreadsheetName: string | undefined, job: Job): Promise<void> => {
    const metaData = finalData.map((sheetsDetail) => ({
        sheetName: sheetsDetail.sheetName,
        tables: sheetsDetail.data.tables,
        //@ts-expect-error
        formulaGroups: sheetsDetail.data.formulaGroups || [],
        headers: sheetsDetail.data.headers,
        tableHash: sheetsDetail.tableHash,
        headerHash: sheetsDetail.headerHash,
    }));

    await job.updateProgress({ step: 5, message: 'updating metadata' });
    await createMetaData({ finalData, spreadsheetId });
    await createOrUpdateSpreadsheetMetaData(spreadsheetId, { metaData, spreadsheetId, spreadsheetName });
};

const mapFormulas = async (sheetsDetail: SheetsDetails, sheetsDetails: SheetsDetails[], cachedFormula: any, sheetsTitle: SheetTitle[], job: Job) => {
    const formulaMapping: any[] = [];
    console.log(sheetsDetail.data.formulaGroupsData.formulaGroups)
    if (sheetsDetail.data.formulaGroupsData.formulaGroups) {
        for (const f of sheetsDetail.data.formulaGroupsData.formulaGroups) {
            const existingFormula = cachedFormula.find((cf: any) => cf.formula === f.formula);
            const validCells = f.cells.filter((loc: string) => {
                const cell = sheetsDetail.data.parsed2DArray.flat().find((c) => c.location === loc);
                return cell && normalizeFormula(cell.formula ?? "") === f.formula;
            });

            if (validCells.length === 0) continue;
            if (existingFormula) {
                formulaMapping.push({ ...f, cells: validCells, formulaMapped: existingFormula.formulaMapped });
            } else {
                const allHeader = sheetsDetail.data.formulaGroupsData.externalSheets
                    ?.map((ex) => sheetsDetails.find((sh) => sh.sheetName === ex)?.data?.headers || [])
                    .flat();
                const formulaMapped = await formulaBussinessMapping(f, [...sheetsDetail.data.headers, ...allHeader], sheetsDetail.sheetName, sheetsTitle).catch(
                    (err) => {
                        console.error(`Error mapping formula for ${sheetsDetail.sheetName}:`, err);
                        return null;
                    }
                );
                if (formulaMapped) {
                    formulaMapping.push({ ...f, cells: validCells, formulaMapped });
                }
            }
        }
        await job.updateProgress({ step: 3, message: `mapped formulas for ${sheetsDetail.sheetName}` });
    }
    return formulaMapping
}

const processSheetData = async (spreadsheetId: string, spreadsheet: Spreadsheet, sheetTitle: SheetTitle, sheetsTitle: SheetTitle[], requestHeaders: RequestConfig['headers'], sheetMeta: SpreadsheetMetadata | null, job: Job) => {
    const cachedMetaData = sheetMeta?.metaData.find((m) => m.sheetName === sheetTitle.title);
    const parsed2DArray = await fetchSheetAs2DObjects(spreadsheetId, requestHeaders, sheetTitle.title);
    if (!parsed2DArray?.length) return null;

    let tables = detectTablesWithHeaders(parsed2DArray);
    tables.sort((a, b) => a.startRow - b.startRow || a.startCol - b.startCol);

    let headers = tables.map((table) => extractHeaders(parsed2DArray, table));
    headers.forEach((h) => {
        h.horizontal.sort((a, b) => a.location.localeCompare(b.location));
        h.vertical.sort((a, b) => a.location.localeCompare(b.location));
    });

    const tableHash = await createHash(tables);
    const headerHash = await createHash(headers);
    const formulaGroupsData = await groupFormulasByStructure(parsed2DArray);

    console.log('Hashes:', { sheet: sheetTitle.title, tableHash, cachedTableHash: cachedMetaData?.tableHash, headerHash, cachedHeaderHash: cachedMetaData?.headerHash });

    if (tableHash === cachedMetaData?.tableHash && headerHash === cachedMetaData?.headerHash && cachedMetaData.headers) {
        headers = cachedMetaData.headers;
        await job.updateProgress({ step: 2, message: `reused cached headers and tables for ${sheetTitle.title}` });
    } else {
        const isVerticalHeader = headers.some((h) => h.vertical.length > 0);
        if (isVerticalHeader) {
            headers = await Promise.all(
                headers.map(async (header) => {
                    if (!header?.vertical?.length) return header;
                    const isHead = await isHeader({
                        header,
                        thisSheetTitle: sheetTitle.title,
                        sheetsTitles: JSON.stringify(sheetsTitle),
                        title: spreadsheet?.properties?.title!,
                    });
                    return isHead.isVerticalHeader ? header : { horizontal: header.horizontal, vertical: [] };
                })
            );
        }
        const flattenHeaders = flattHeaders(headers);
        const bussinessConceptMappedHeaders = await headerBussinessMapping(flattenHeaders, spreadsheet?.properties?.title, sheetsTitle);
        headers = unflattenHeaders(bussinessConceptMappedHeaders?.headers || []);
        await job.updateProgress({ step: 2, message: `mapped headers with business concept for ${sheetTitle.title}` });
    }

    return { tableHash, headerHash, sheetName: sheetTitle.title, data: { parsed2DArray, tables, headers, formulaGroupsData } };
}

const bulkUpsertCellIndex = async (toEmbed: Cell[], spreadsheetId: string, sheetName: string, isLastSheet: boolean, jobId: string, job: Job) => {
    // Embed only new or updated cells
    if (toEmbed.length > 0) {
        // Batch embedding to avoid overload
        for (let k = 0; k < toEmbed.length; k += 100) {
            const batch = toEmbed.slice(k, k + 100);
            await embedCell(batch, spreadsheetId, sheetName, isLastSheet && k + 100 >= toEmbed.length, jobId);
            await job.updateProgress({ step: 4, message: `embedded ${batch.length} cells for ${sheetName}` });
            console.log(`Embedded cells: ${batch.map((b) => b.location).join(', ')}`);
        }
    }

    const lastSyncedAt = new Date()
    const bulkUpdateCellIndex = toEmbed.map((row) => ({
        updateOne: {
            filter: { pointId: row.pointId },
            update: { $set: { pointId: row.pointId, spreadsheetId, sheetName, location: row.location, hash: row.hash, lastSyncedAt } },
            upsert: true,
        },
    }));

    if (bulkUpdateCellIndex.length > 0) {
        await CellIndexModel.bulkWrite(bulkUpdateCellIndex).catch((err) => console.error(`Error updating CellIndexModel for ${sheetName}:`, err));
        console.log(`Updated CellIndexModel for ${sheetName}: ${toEmbed.length} cells`);
    }
}

const processCell = async (p: Cell, sheetsDetail: SheetsDetails, spreadsheetId: string) => {
    if (p.value == null && p.formula == null) return null;
    const headerCell = getCellHeaders(p.location, sheetsDetail.data.headers[0]);
    let formulaDescription: string | undefined;
    let semanticFormula: string | undefined;

    //@ts-expect-error
    for (const e of sheetsDetail.data.formulaGroups || []) {
        if (e.cells.includes(p.location)) {
            formulaDescription = e.formulaMapped?.description;
            semanticFormula = e.formulaMapped?.semanticFormula;
            break;
        }
    }

    const cellWithHeader = { ...p, headerCell, formulaDescription, semanticFormula };
    const para = flattenSemanticData(cellWithHeader);
    const pointId = makePointId(spreadsheetId, sheetsDetail.sheetName, p.location);
    const hash = await createHash(para || '');
    return { ...cellWithHeader, para, pointId, hash };

}


export const syncSheet = async (spreadsheetId: string, jobId: string, job: Job) => {
    let jobData = await updateSheetJobData(jobId, { status: 'processing', startedAt: new Date() });
    emitter.emit(CHANNEL, jobData);
    const allPointIds: string[] = [];

    try {
        const sheetMeta = await getSpreadsheetMetaData(spreadsheetId);
        const { access_token } = await refreshToken();
        const requestHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

        const spreadsheet = await fetchSpreadsheetMetadata(spreadsheetId, requestHeaders);
        await job.updateProgress({ step: 1, message: 'got spreadsheet' });
        jobData = await updateSheetJobData(jobId, { spreadSheetName: spreadsheet?.properties?.title });
        emitter.emit(CHANNEL, jobData);

        if (!spreadsheet?.sheets) throw new Error('No sheets found in spreadsheet');

        const sheetsTitle = spreadsheet.sheets.map((s) => ({ sheetId: s?.properties?.sheetId!, title: s?.properties?.title! }));

        const sheetsDetails = (await Promise.all(sheetsTitle.map(async (sheetTitle) => {
            return await processSheetData(spreadsheetId, spreadsheet, sheetTitle, sheetsTitle, requestHeaders, sheetMeta, job);
        })
        )).filter(Boolean) as SheetsDetails[];

        if (!sheetsDetails.length) {
            jobData = await updateSheetJobData(jobId, { status: 'success', completedAt: new Date() });
            emitter.emit(CHANNEL, jobData);
            return { spreadsheetName: spreadsheet?.properties?.title, data: [] };
        }

        const finalData = await Promise.all(
            sheetsDetails.map(async (sheetsDetail, i, arr) => {
                const isLastSheet = i === arr.length - 1;
                const cachedMetaData = sheetMeta?.metaData.find((m) => m.sheetName === sheetsDetail.sheetName) || {};
                //@ts-expect-error
                const cachedFormula = cachedMetaData.formulaGroups || [];

                //@ts-expect-error
                sheetsDetail.data.formulaGroups = await mapFormulas(sheetsDetail, sheetsDetails, cachedFormula, sheetsTitle, job);

                const parsed2DArray = await Promise.all(
                    sheetsDetail.data.parsed2DArray.map(async (parsedData, j, arr) => {
                        const row = await Promise.all(parsedData.map(async (p) => {
                            return await processCell(p, sheetsDetail, spreadsheetId)
                        }));
                        const filteredRow = row.filter(Boolean) as Cell[];
                        if (filteredRow.length === 0) return [];

                        allPointIds.push(...filteredRow.map((cell) => cell.pointId));
                        return filteredRow;
                    })
                );

                const sheetPointIds = parsed2DArray.flat().map((x) => x.pointId);
                const existing = await CellIndexModel.find({ pointId: { $in: sheetPointIds } }).lean().select({ pointId: 1, hash: 1 });
                const existingMap = new Map(existing.map((e) => [e.pointId, e.hash]));

                const toEmbed = parsed2DArray
                    .flat()
                    .filter((x) => !existingMap.has(x.pointId) || existingMap.get(x.pointId) !== x.hash);
                console.log('toEmbed', toEmbed.map((u) => u.location));

                await bulkUpsertCellIndex(toEmbed, spreadsheetId, sheetsDetail.sheetName, isLastSheet, jobId, job)

                return { ...sheetsDetail, data: { ...sheetsDetail.data, parsed2DArray } };
            })
        );

        await reconcileDeletions(spreadsheetId, allPointIds, job)

        await updateSheetMetadata(finalData, spreadsheetId, spreadsheet?.properties?.title, job)

        jobData = await updateSheetJobData(jobId, { status: 'success', completedAt: new Date() });
        emitter.emit(CHANNEL, jobData);

        return { spreadsheetName: spreadsheet?.properties?.title, data: finalData };
    } catch (error) {
        console.error('Error in syncSheet:', error);
        let errorMsg = (error as Error).message;
        if ((error as any).status === 403 || (error as any).status === 404) {
            errorMsg = `At the moment, this app only works with Google Sheets that are shared publicly (accessible to anyone with the link). ${errorMsg}`;
        }
        jobData = await updateSheetJobData(jobId, { status: 'failed', error: errorMsg });
        emitter.emit(CHANNEL, jobData);
        throw error;
    }
}





