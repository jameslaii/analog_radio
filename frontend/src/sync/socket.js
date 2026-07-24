import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001';

const socket = io(BACKEND_URL, { autoConnect: false });

export { socket };
