// socket.ts
import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from "events";
import Redis from "ioredis";

let io: Server; // <-- Scoped Socket.IO server

export const initSocket = (server: HTTPServer) => {
    io = new Server(server, {
        cors: {
            origin: '*',
        },
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
};

export const socketIO = (): Server => {
    console.log("test")
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};

//
