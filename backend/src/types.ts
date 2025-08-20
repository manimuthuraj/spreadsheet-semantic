import { Job } from "bullmq";

export interface Spreadsheet {
    spreadsheetId: string;
    properties?: {
        title?: string;
        locale?: string;
        timeZone?: string;
        defaultFormat?: any;
        [key: string]: any;
    };
    sheets?: Sheet[];
    namedRanges?: any[];
    spreadsheetUrl?: string;
    [key: string]: any;
}

interface Sheet {
    properties?: {
        sheetId?: string;
        title?: string;
        index?: number;
        sheetType?: string;
        gridProperties?: {
            rowCount?: number;
            columnCount?: number;
            [key: string]: any;
        };
        [key: string]: any;
    };
    data?: any[]; // Each element corresponds to a GridData object
    merges?: any[];
    conditionalFormats?: any[];
    protectedRanges?: any[];
    developerMetadata?: any[];
    [key: string]: any;
}



export interface SheetJob {
    readonly _id: string;
    spreadsheetId: string;
    status: 'pending' | 'processing' | 'success' | 'failed' | 'error';
    spreadSheetName?: string
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
    result?: any;
    createdAt: Date;
    updatedAt: Date;
}

export interface Cell {
    location: string;
    value: any;
    formula?: string | null;
    layout?: "horizontal" | "vertical";
    sheetName: String
};

export interface Header extends Cell {
    concept: string;
    description: string;
    sheetName: string;
    synonyms?: string[];
    metricType: string;
}

export interface Headers {
    horizontal: Header[] | Cell[];
    vertical: Header[] | Cell[];
}

export interface Table {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    horizontalHeaders: number[];
    verticalHeaders: number[];
}

export interface FormulaMapped {
    description: string;
    formula: string;
    semanticFormula: string;
}

export interface FormulaGroup {
    formula: string;
    cells: string[];
    formulaMapped: FormulaMapped;
}

export interface SheetMetadata {
    sheetName: string;
    tables: Table[];
    formulaGroups: FormulaGroup[];
    headers: Headers[];
}

export interface SpreadsheetMetadata {
    spreadsheetId: string;
    spreadsheetName?: string;
    metaData: SheetMetadata[];
    __v?: number;
    createdAt?: Date; // because of timestamps: true
    updatedAt?: Date;
}


export interface RequestConfig {
    url?: string
    headers: Record<string, string>,
    method: "GET" | "POST" | "DELETE" | "PATCH"
}

export interface TableBlock {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    horizontalHeaders?: number[]; // row indices
    verticalHeaders?: number[];   // column indices
};

export interface TableRegion {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    horizontalHeaders: number[]; // row indices
    verticalHeaders: number[];   // col indices
};

export interface FormulaGroupData {
    formulaGroups: {
        formula: string;
        cells: string[];
    }[];
    externalSheets: string[];
}

export interface EmbeedSheetDataPayload {
    sheetName: string;
    data: {
        parsed2DArray: Cell[][];
        tables: TableRegion[];
        headers: Headers[];
        formulaGroupsData: FormulaGroupData;
    };
}

export interface SheetTitle { sheetId: string; title: string }
export interface GetSheetDataPayload { spreadsheetId: string, requestHeaders: RequestConfig['headers'], spreadsheet: Spreadsheet, sheetTitle: SheetTitle, sheetsTitle: SheetTitle[], job: Job<any, any, string> }

export interface IsHeaderPayload { header: Partial<Headers>; thisSheetTitle: string, sheetsTitles: string, title: string }


export interface SheetsDetails {
    sheetName: string;
    data: {
        parsed2DArray: Cell[][];
        tables: TableRegion[];
        headers: {
            horizontal: Cell[];
            vertical: Cell[];
        }[];
        formulaGroupsData: {
            formulaGroups: {
                formula: string;
                cells: string[];
            }[];
            externalSheets: string[];
        };
    };
}


export interface QueryLog {
    readonly _id: string;
    spreadsheetId: string;
    userQuery: string;
    aiResponse: Record<string, any>[];
    qdrandDBData: Record<string, any>[];
    createdAt: Date;
    updatedAt: Date;
}