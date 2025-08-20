import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { formulaBussinessMapping, headerBussinessMapping, isHeader } from '../AI/gemini';
import { createEmbedding } from "../AI/openai"
import { refreshToken } from '../credentials/credential';
import { insertPoints } from '../vector/qdrand';
import { embeedSheet } from '../queue.ts/queue';
import { createMetaData, createOrUpdateSpreadsheetMetaData } from '../model/storeMetaData';
import { sheetJobModel, updateSheetJobData } from '../model/sheetsJob';
import { Job } from 'bullmq';
import emitter, { CHANNEL } from '../emitter';
import { Cell, RequestConfig, TableBlock, TableRegion, Headers, Spreadsheet, SheetTitle, GetSheetDataPayload, EmbeedSheetDataPayload, SheetsDetails } from '../types';


function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

export const embedCell = async (cells: Cell[][], sheetId: string, spreadSheetName: string, isLastRow: boolean, jobId: string) => {

    const payload = await Promise.all(cells.map(async (c: any) => {
        const vector = await createEmbedding(c.para)
        return { id: uuidv4(), payload: { ...c, sheetId, spreadSheetName }, vector }
    }))

    await insertPoints(payload)
    if (isLastRow && jobId) {
        const jobData = await sheetJobModel.findByIdAndUpdate({ _id: jobId }, { status: 'success', completedAt: new Date() })
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
    const { access_token } = await refreshToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const { data } = await axios.get<Spreadsheet>(url, { headers, }) ?? {};
    return data;
}

const getSheetsData = async (payload: GetSheetDataPayload) => {
    const { spreadsheetId, requestHeaders, spreadsheet, sheetTitle, sheetsTitle, job } = payload
    const parsed2DArray = await fetchSheetAs2DObjects(spreadsheetId, requestHeaders, sheetTitle.title!);
    if (!parsed2DArray?.length) return

    const tables = detectTablesWithHeaders(parsed2DArray);
    let headers = tables.map((table) => extractHeaders(parsed2DArray, table))

    await job.updateProgress({ step: 2, message: "got sheet data and headers" })

    const isVerticalHeader = headers.some((h) => h.vertical.length > 0)
    if (isVerticalHeader) {
        headers = await Promise.all(headers.map(async (header) => {
            if (!header?.vertical?.length) return header
            const isHead = await isHeader({ header, thisSheetTitle: sheetTitle.title, sheetsTitles: JSON.stringify(sheetTitle), title: spreadsheet?.properties?.title! })
            if (isHead.isVerticalHeader) return header
            console.log(isHead.isVerticalHeader)
            return { horizontal: header.horizontal, vertical: [] }
        }))
    }

    await job.updateProgress({ step: 3, message: "checked vertical header" })

    const formulaGroups = await groupFormulasByStructure(parsed2DArray);

    const flattenHeaders = flattHeaders(headers)
    const bussinessConceptMappedHeaders = await headerBussinessMapping(flattenHeaders, spreadsheet?.properties?.title, sheetsTitle)
    headers = unflattenHeaders(bussinessConceptMappedHeaders?.headers)
    // await sleep(10000)
    await job.updateProgress({ step: 3, message: "mapped headers with bussiness concept" })

    return ({ sheetName: sheetTitle.title, data: { parsed2DArray, tables, headers: headers, formulaGroupsData: formulaGroups } });
}

const processEmbedData = async (sheetsDetail: EmbeedSheetDataPayload, sheetsDetails: EmbeedSheetDataPayload[], spreadsheetId: string, jobId: string, job: Job, sheetsTitle: SheetTitle[], isLastSheet: boolean, spreadsheetName?: string) => {
    const formulaMapping = [];
    for (const f of sheetsDetail?.data?.formulaGroupsData?.formulaGroups || []) {
        const allHeader = sheetsDetail?.data?.formulaGroupsData?.externalSheets?.map((ex) => {
            return sheetsDetails?.find((sh) => sh.sheetName === ex)?.data?.headers
        })
        const formulaMapped = await formulaBussinessMapping(f, [...sheetsDetail.data.headers, ...allHeader], sheetsDetail?.sheetName, sheetsTitle).catch();
        formulaMapping.push({ ...f, formulaMapped });
        await job.updateProgress({ step: 4, message: "formula bussiness mapping" })

    }

    //@ts-expect-error
    sheetsDetail.data.formulaGroups = formulaMapping

    const parsed2DArray = await Promise.all(sheetsDetail.data.parsed2DArray.map(async (parsedData, i: number, arr) => {
        const isLastRow = i === arr.length - 1;
        const row = parsedData.map((p, i: number) => {
            const headerCell = getCellHeaders(p.location, sheetsDetail.data.headers[0])
            let formulaDescription; let semanticFormula

            //@ts-expect-error
            if (sheetsDetail?.data?.formulaGroups?.length) {
                //@ts-expect-error
                sheetsDetail.data.formulaGroups.forEach((e) => {
                    if (e?.cells?.includes(p.location)) {
                        formulaDescription = e?.formulaMapped?.description;
                        semanticFormula = e?.formulaMapped?.semanticFormula;
                    }
                });
            }
            const cellWithHeader = { ...p, headerCell, formulaDescription, semanticFormula }
            const para = flattenSemanticData(cellWithHeader)
            return { ...cellWithHeader, para }
        })

        await embeedSheet({ row, spreadsheetId, spreadsheetName, isLastRow: isLastSheet && isLastRow, jobId })
        await job.updateProgress({ step: 5, message: "embedding" })

        return row
    }))
    return {
        sheetName: sheetsDetail.sheetName,
        data: { ...sheetsDetail.data, parsed2DArray }
    }
}


export async function processSheetAndStore(spreadsheetId: string, jobId: string, job: Job) {
    let jobData = await updateSheetJobData(jobId, { status: 'processing', startedAt: new Date() })
    emitter.emit(CHANNEL, jobData)
    try {
        const { access_token } = await refreshToken();
        const requestHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${access_token}`, }

        const spreadsheet = await fetchSpreadsheetMetadata(spreadsheetId, requestHeaders)

        await job.updateProgress({ step: 1, message: "got spreadsheet" })
        jobData = await updateSheetJobData(jobId, { spreadSheetName: spreadsheet?.properties?.title })
        emitter.emit(CHANNEL, jobData)

        if (!spreadsheet?.sheets) throw new Error('sheets not found')

        const sheetsTitle = spreadsheet?.sheets?.map((s) => {
            return { sheetId: s?.properties?.sheetId!, title: s?.properties?.title! }
        })

        const sheetsDetails = (await Promise.all(sheetsTitle.map(async (sheetTitle) => {
            return await getSheetsData({ job, requestHeaders, sheetsTitle, sheetTitle, spreadsheet, spreadsheetId })
        }))).filter(Boolean) as SheetsDetails[]

        if (!sheetsDetails?.length) {
            let jobData = await updateSheetJobData(jobId, { status: 'success', completedAt: new Date() })
            emitter.emit(CHANNEL, jobData)
            return
        }



        const embedData = async () => {
            return Promise.all(sheetsDetails.map(async (sheetsDetail, i, arr) => {
                const isLastSheet = i === arr.length - 1;
                return await processEmbedData(sheetsDetail, sheetsDetails, spreadsheetId, jobId, job, sheetsTitle, isLastSheet, spreadsheet?.properties?.title)
            }))
        }

        const finalData = await embedData()
        const metaData = finalData.map((sheetsDetail) => {
            //@ts-expect-error
            return { sheetName: sheetsDetail.sheetName, tables: sheetsDetail?.data?.tables, formulaGroups: sheetsDetail?.data?.formulaGroups, headers: sheetsDetail?.data?.headers }
        })

        await job.updateProgress({ step: 3, message: "add meta data" })

        await createMetaData({ finalData, spreadsheetId })
        await createOrUpdateSpreadsheetMetaData(spreadsheetId, { metaData, spreadsheetId, spreadsheetName: spreadsheet?.properties?.title })
        console.log(metaData)

        return { spreadsheetName: spreadsheet?.properties?.title, data: finalData }
    } catch (error) {
        console.log(error, "error makig ")
        let errorMsg = (error as Error)?.message

        //@ts-expect-error
        if (error.status == 403 || error.status == 404) {
            errorMsg = `At the moment, this app only works with Google Sheets that are shared publicly (accessible to anyone with the link), Implementing for all. ${(error as Error)?.message}`
        }

        const jobData = await sheetJobModel.findOneAndUpdate({ _id: jobId }, { status: 'failed', error: errorMsg }, { new: true })
        emitter.emit(CHANNEL, jobData)
    }
}






