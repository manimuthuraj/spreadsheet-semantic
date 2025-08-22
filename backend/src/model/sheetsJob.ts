import mongoose from "mongoose";
import { SheetJob } from "../types";


const SheetJobSchema = new mongoose.Schema<SheetJob>({
    spreadsheetId: { type: String, required: true },
    spreadSheetName: { type: String, },
    status: {
        type: String,
        enum: ['pending', 'processing', 'success', 'failed'],
        default: 'pending'
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
    result: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

SheetJobSchema.index({ spreadsheetId: 1 })

export const sheetJobModel = mongoose.model('SheetJob', SheetJobSchema);

export const spreadsheetJob = async (spreadsheetId: string) => {
    const sheetJobData = await sheetJobModel.findOne({ spreadsheetId }).lean<SheetJob>({ virtuals: true, defaults: true })
    return sheetJobData
}

export const createSpreadsheetJob = async (spreadsheetJobData: Partial<SheetJob>) => {
    return (await sheetJobModel.create(spreadsheetJobData)).toJSON() as SheetJob
}

export const updateSheetJobData = async (jobId: string | undefined, jobData: Partial<SheetJob>) => {
    return await sheetJobModel.findOneAndUpdate({ _id: jobId }, jobData, { upsert: true, new: true })

}

export const sheetJobs = async () => {
    return await sheetJobModel.aggregate<SheetJob>([
        {
            $sort: { updatedAt: -1 }
        },
        {
            $group: {
                _id: '$spreadsheetId',
                latestJob: { $last: '$$ROOT' }
            }
        },
        {
            $match: {
                latestJob: { $ne: null }
            }
        },
        {
            $replaceRoot: { newRoot: '$latestJob' }
        }
    ])
}