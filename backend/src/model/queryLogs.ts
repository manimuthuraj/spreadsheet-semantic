import mongoose from "mongoose";
import { QueryLog, SheetJob } from "../types";


const QueryLogSchema = new mongoose.Schema<QueryLog>({
    spreadsheetId: { type: String, required: true },
    aiResponse: mongoose.Schema.Types.Mixed,
    userQuery: { type: String, required: true },
    qdrandDBData: mongoose.Schema.Types.Mixed
}, { timestamps: true });


export const QueryLogModel = mongoose.model('QueryLogs', QueryLogSchema);


export const createQueryLog = async (queryLogData: Partial<QueryLog>) => {
    return (await QueryLogModel.create(queryLogData)).toJSON() as QueryLog
}