import { Queue } from 'bullmq';
import connection from '../redis';
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";


export const VECTORIZE_QUEUE = 'vectorizeQueue'
export const PARSESHEET_QUEUE = 'ParseSheetQueue'

export const PARSE_SHEET_JOB = 'ParseSheetJob'
export const EMBEED_SHEET_JOB = 'EmbeedSheet'

export const SYNC_REPEATABLE_SHEET_JOB = 'syncSheetRepeatableJob'

export const myQueue = new Queue(VECTORIZE_QUEUE, { connection });
const processSheetQueue = new Queue(PARSESHEET_QUEUE, { connection })

// Add a job
export const embeedSheet = async (data: any, delay?: number) => {
  await myQueue.add(EMBEED_SHEET_JOB, data, { delay, removeOnComplete: true });
}

export const addSheetParseJob = async (data: any, delay?: number) => {
  await processSheetQueue.add(PARSE_SHEET_JOB, data, { removeOnComplete: true, delay })
}



// Add repeatable job for syncSheet
export const repeatableSyncJob = async () => {
  try {
    const halfAnHour = 30 * 60 * 1000
    // Remove any existing repeatable jobs with the same name to avoid duplicates
    await processSheetQueue.removeRepeatable(SYNC_REPEATABLE_SHEET_JOB, {
      every: halfAnHour
    });

    // Add new repeatable job
    await processSheetQueue.add(SYNC_REPEATABLE_SHEET_JOB, { jobId: `sync-sheet-${Date.now()}` },
      {
        repeat: { every: halfAnHour },
        jobId: 'syncSheetRepeatableJob',
        removeOnComplete: true,
        removeOnFail: false
      });
    console.log('Repeatable syncSheet job scheduled successfully');
  } catch (error) {
    console.error('Error setting up repeatable syncSheet job:', error);
  }
};



// bull board
export const serverAdapter = new ExpressAdapter();
(async () => {
  createBullBoard({
    queues: [
      new BullMQAdapter(myQueue),
      new BullMQAdapter(processSheetQueue)
    ],
    serverAdapter,
  });
})();
