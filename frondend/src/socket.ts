import { io } from "socket.io-client";

const SOCKET_SERVER_URL = import.meta.env.VITE_API_BASE_URL;
export const socket = io(SOCKET_SERVER_URL);