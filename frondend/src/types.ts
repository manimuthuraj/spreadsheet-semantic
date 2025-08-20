export interface SheetJob {
    readonly _id: string
    id: string;
    spreadsheetId: string;
    spreadSheetName?: string;
    status: 'pending' | 'processing' | 'success' | 'failed' | 'error';
    error?: string;

    progress?: { step: number; message: string };
}


export interface AIResponseItem {
    concept_name: string;
    location: {
        sheet_name: string;
        cell_range: string;
    };
    value: any;
    formula: string | null;
    explanation: string;
    relevance: string;
}