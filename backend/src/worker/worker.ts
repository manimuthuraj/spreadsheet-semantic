import "../dot-env.config"
import "../socket"
import "../model/dbConnection"
import { Queue, Worker } from 'bullmq';
import connection from '../redis';
import { processSheetAndStore, embedCell } from '../parser/sheetParser';




const worker = new Worker('vectorizeQueue', async job => {
  console.log('Processing job:', job);

  await embedCell(job.data.row, job.data.spreadsheetId, job.data.spreadsheetName, job.data.isLastRow, job.data.jobId)
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});



const parseSheetWorker = new Worker('ParseSheetQueue', async job => {
  console.log('Processing job:', job);

  await processSheetAndStore(job.data.spreadsheetId, job.data.jobId, job)
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