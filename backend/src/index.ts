import express, { Request, Response } from "express"
import "./dot-env.config"
import cors from 'cors';

import { repeatableSyncJob, serverAdapter } from "./queue.ts/queue";
import { createServer } from "http";
import { initSocket, socketIO } from "./socket";
import emitter, { CHANNEL } from "./emitter";
import routers from "./routers/sheet.routers";
import { tokenCallBack } from "./controllers/sheet.controller";

import "./model/dbConnection"

export const app = express();
export const server = createServer(app);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

serverAdapter.setBasePath("/api/bullboard");
app.use("/api/bullboard", serverAdapter.getRouter());
app.get('/auth/google/callback', tokenCallBack)
app.use("/api", routers)

// Health check
app.get('/', async (req: Request, res: Response) => {
  res.send({ message: 'ok' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  initSocket(server)

  emitter.on(CHANNEL, (data) => {
    socketIO().emit("sheetStatusUpdate", data);
  });

  await repeatableSyncJob();
});

