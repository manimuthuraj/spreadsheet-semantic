import { Queue } from 'bullmq';
import connection from '../redis';
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

// Redis connection

export const myQueue = new Queue('vectorizeQueue', { connection });
const processSheetQueue = new Queue('ParseSheetQueue', { connection })

// Add a job
export const embeedSheet = async (data: any, delay?: number) => {
  await myQueue.add('EmbeedSheet', data, { delay, removeOnComplete: true });
}

export const addSheetParseJob = async (data: any) => {
  await processSheetQueue.add('ParseSheetJob', data, { removeOnComplete: true })
}

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
