import mongoose from 'mongoose';
import { SpreadsheetMetadata } from '../types';

const Schema = mongoose.Schema;

const HeaderSchema = new Schema({
    concept: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    sheetName: { type: String, required: true },
    synonyms: [{ type: String }],
    value: { type: Schema.Types.Mixed }, // Can be string or null
    formula: { type: String, default: null },
    metricType: { type: String, required: true },
});

const HeadersSchema = new Schema({
    horizontal: [HeaderSchema],
    vertical: [HeaderSchema],
});

const TableSchema = new Schema({
    startRow: { type: Number, required: true },
    endRow: { type: Number, required: true },
    startCol: { type: Number, required: true },
    endCol: { type: Number, required: true },
    horizontalHeaders: [{ type: Number }],
    verticalHeaders: [{ type: Number }],
});

const FormulaGroupSchema = new Schema({
    formula: { type: String, required: true },
    cells: [{ type: String }],
    formulaMapped: {
        description: { type: String, required: true },
        formula: { type: String, required: true },
        semanticFormula: { type: String, required: true },
    },
});

const SheetMetadataSchema = new Schema({
    sheetName: { type: String, required: true },
    tables: [TableSchema],
    formulaGroups: [FormulaGroupSchema],
    headers: [HeadersSchema],
});

const SpreadsheetMetadataSchema = new Schema<SpreadsheetMetadata>({
    spreadsheetId: { type: String, required: true },
    spreadsheetName: { type: String, },
    metaData: [SheetMetadataSchema],
    __v: { type: Number, default: 0 },
}, { timestamps: true });

SpreadsheetMetadataSchema.index({ spreadsheetId: 1 })

const SpreadsheetModel = mongoose.model('SpreadsheetMetadata', SpreadsheetMetadataSchema);


export const createOrUpdateSpreadsheetMetaData = async (spreadsheetId: string, metaData: any) => {
    const document = await SpreadsheetModel.findOneAndUpdate({ spreadsheetId }, metaData, { upsert: true });
    return document
}

export const getSpreadsheetMetaData = async (spreadsheetId: string) => {
    const metaData = await SpreadsheetModel.find({ spreadsheetId }).lean<SpreadsheetMetadata>({ defaults: true });
    return metaData
}


const FlexibleSchema = new mongoose.Schema({}, { strict: false });

const Model = mongoose.model('MetaData', FlexibleSchema, 'collection_name');

export const createMetaData = async (metaData: any) => {
    return await Model.create(metaData);
}