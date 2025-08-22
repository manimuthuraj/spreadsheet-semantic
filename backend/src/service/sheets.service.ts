import { makeQuery, searchSheet } from "../AI/gemini"
import { createEmbedding } from "../AI/openai"
import { createQueryLog } from "../model/queryLogs"
import { createSpreadsheetJob, sheetJobs, spreadsheetJob, updateSheetJobData } from "../model/sheetsJob"
import { getSpreadsheetMetaData } from "../model/storeMetaData"
import { addSheetParseJob } from "../queue.ts/queue"
import { findVector } from "../vector/qdrand"

export const getAllSheetsJob = async () => {
    return await sheetJobs()
}

export const searchData = async (sheetId: any, query: any) => {

    const finalData = await getSpreadsheetMetaData(sheetId)
    const headers = finalData?.metaData?.map((sheet) => {
        return sheet.headers
    })
    const sheetNames = finalData?.metaData?.map((sheet) => {
        return sheet.headers
    })

    const formula = finalData?.metaData?.map((sheet) => {
        return sheet.formulaGroups
    })

    // const formatedQuery = await makeQuery(query, headers, sheetNames, formula)
    const queryVector = await createEmbedding(query);
    const filter = {
        must: [
            {
                key: 'sheetId',
                match: {
                    value: sheetId,
                },
            },
        ],
    }

    const data = await findVector(queryVector, filter)
    const result = await searchSheet(query, headers, sheetNames, formula, data)

    await createQueryLog({ userQuery: query, qdrandDBData: data, aiResponse: result, spreadsheetId: sheetId }).catch((error) => console.log(error)) // log this to monitor for improvements

    return { data, result, query }
}

export const parseSheet = async (spreadsheetId: string) => {
    let jobId
    try {
        const sheetJobData = await spreadsheetJob(spreadsheetId)
        if (sheetJobData?.status === "pending" || sheetJobData?.status === "processing") {
            throw new Error('sheet already processing')
        }

        const sheetjobData = await createSpreadsheetJob({ spreadsheetId, status: 'pending' })
        jobId = sheetjobData._id
        await addSheetParseJob({ jobId, spreadsheetId });
        return sheetjobData
    } catch (error) {
        console.log(error)
        return await updateSheetJobData(jobId, { spreadsheetId, status: 'error', error: (error as Error)?.message })
    }
}


export const syncAllSheets = async () => {
    const existingSheets = (await sheetJobs()).filter((sheet) => sheet.status === "success")
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const now = Date.now();

    existingSheets.map(async (e) => {

        for (const sheet of existingSheets) {
            const lastUpdated = new Date(sheet.updatedAt).getTime();

            if (now - lastUpdated >= FIFTEEN_MINUTES) {
                // ✅ More than 15 mins old → enqueue sync
                const jobId = e._id
                await addSheetParseJob({ jobId, spreadsheetId: e.spreadsheetId });
                console.log(`Queued sync for ${sheet.spreadsheetId}`);
            } else {
                console.log(
                    `Skipped ${sheet.spreadsheetId} (last updated ${Math.round((now - lastUpdated) / 60000)} mins ago)`
                );
            }
        }
    })
}
