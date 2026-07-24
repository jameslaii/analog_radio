require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const {
  createRoom,
  joinRoom,
  leaveRoom,
  findRoomByHostSocket,
  findRoomsByListenerSocket,
  setLastState,
  getRoom,
  deleteRoom,
} = require('./rooms');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5173';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
});

io.on('connection', (socket) => {
  socket.on('room:create', (_payload, ack) => {
    const roomId = createRoom(socket.id);
    socket.join(roomId);
    if (typeof ack === 'function') ack({ roomId });
  });

  socket.on('room:join', ({ roomId } = {}, ack) => {
    const room = joinRoom(roomId, socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'room_not_found' });
      return;
    }
    socket.join(roomId);
    io.to(roomId).emit('room:presence', { listenerCount: room.listeners.size });
    if (typeof ack === 'function') ack({ ok: true, lastState: room.lastState });
  });

  socket.on('host:state', ({ roomId, state } = {}) => {
    if (!roomId || !state) return;
    const room = getRoom(roomId);
    if (!room || room.hostSocketId !== socket.id) return;
    setLastState(roomId, state);
    socket.to(roomId).emit('host:state', state);
  });

  socket.on('disconnect', () => {
    const hostedRoomId = findRoomByHostSocket(socket.id);
    if (hostedRoomId) {
      io.to(hostedRoomId).emit('host:left', {});
      deleteRoom(hostedRoomId);
    }

    const listenerRoomIds = findRoomsByListenerSocket(socket.id);
    for (const roomId of listenerRoomIds) {
      leaveRoom(roomId, socket.id);
      const room = getRoom(roomId);
      if (room) {
        io.to(roomId).emit('room:presence', { listenerCount: room.listeners.size });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`analog radio relay listening on :${PORT}`);
});
