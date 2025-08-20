import express, { Request, Response } from "express"
import { OauthURI, getToken } from "../credentials/credential";
import { getAllSheetsJob, parseSheet, searchData } from "../service/sheets.service";

const router = express.Router();

export const healthCheck = async (req: Request, res: Response) => {
    try {
        res.json({ message: 'ok' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
        return
    }
}

export const getOauthURI = async (req: Request, res: Response) => {
    try {
        const data = await OauthURI()
        res.json({ data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
        return
    }
};




export const tokenCallBack = async (req: Request, res: Response) => {
    try {
        const data = await getToken(req.originalUrl);
        res.json({ data: data.data })
    } catch (error) {
        const err = error as Error;
        res.json(error)
    }
}

export const getSheets = async (req: Request, res: Response) => {
    try {
        res.json({ data: await getAllSheetsJob() });
        return
    } catch (err: any) {
        console.log(err)
        res.status(500).json({ error: err });
        return
    }
}

export const searchSheets = async (req: Request, res: Response) => {
    const { spreadsheetId, query } = req.body;
    try {
        const data = await searchData(spreadsheetId, query);
        res.json(data);
        return
    } catch (err: any) {
        console.log(err)
        res.status(500).json({ error: err });
        return
    }

}


export const getParseSheet = async (req: Request, res: Response) => {
    const { spreadsheetId } = req.body;
    if (!spreadsheetId) {
        res.status(400).json({ error: 'spreadsheetId are required' });
        return;
    }
    try {
        const data = await parseSheet(spreadsheetId)
        res.json({ data });
        return
    } catch (err: any) {
        console.log(err)
        res.status(500).json({ error: err });
        return
    }
}


export default router