import mongoose from "mongoose";
import { ICellIndex } from "../types";


const CellIndexSchema = new mongoose.Schema<ICellIndex>({
    spreadsheetId: { type: String, index: true },
    sheetName: { type: String, index: true },
    location: { type: String, },
    pointId: { type: String, index: true },
    hash: { type: String, },
    lastSyncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

CellIndexSchema.index({ spreadsheetId: 1, pointId: 1 });

export const CellIndexModel = mongoose.model("CellIndex", CellIndexSchema);