import express from "express"
import { getOauthURI, getParseSheet, getSheets, healthCheck, searchSheets, tokenCallBack } from "../controllers/sheet.controller";

const router = express.Router();


// router.post('/api/load-sheet', async (req: Request, res: Response) => {
//     const { spreadsheetId } = req.body;
//     if (!spreadsheetId) {
//         res.status(400).json({ error: 'spreadsheetId and range are required' });
//         return;
//     }
//     try {
//         const data = await getSheetData(spreadsheetId);
//         res.json(data);
//         return
//     } catch (err: any) {
//         console.log(err)
//         res.status(500).json({ error: err });
//         return
//     }
// });

router.get('/', healthCheck)
router.get('/health', healthCheck)


router.get('/geturi', getOauthURI);

router.get("/sheets/load", getSheets)

router.post('/sheet/search', searchSheets)

router.post('/sheet/parse', getParseSheet);



export default router