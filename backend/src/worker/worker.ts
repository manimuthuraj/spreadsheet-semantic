import "../dot-env.config"
import "../socket"
import "../model/dbConnection"
import { Queue, Worker } from 'bullmq';
import connection from '../redis';
import { embedCell, syncSheet } from '../parser/sheetParser';
import { EMBEED_SHEET_JOB, PARSE_SHEET_JOB, PARSESHEET_QUEUE, SYNC_REPEATABLE_SHEET_JOB, VECTORIZE_QUEUE } from "../queue.ts/queue";
import { syncAllSheets } from "../service/sheets.service";



const worker = new Worker(VECTORIZE_QUEUE, async job => {
  console.log('Processing job:', job.name, job.data);

  if (job.name === EMBEED_SHEET_JOB) {
    await embedCell(job.data.row, job.data.spreadsheetId, job.data.spreadsheetName, job.data.isLastRow, job.data.jobId)
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});



const parseSheetWorker = new Worker(PARSESHEET_QUEUE, async job => {
  console.log('Processing job:', job.name, job.data);

  if (job.name === PARSE_SHEET_JOB) {
    await syncSheet(job.data.spreadsheetId, job.data.jobId, job)
  }

  if (job.name === SYNC_REPEATABLE_SHEET_JOB) {
    await syncAllSheets()
  }
}, { connection });

parseSheetWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

parseSheetWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});

process.on('SIGINT', async () => {
  console.log('Closing worker...');
  await worker.close();
  process.exit(0);
});