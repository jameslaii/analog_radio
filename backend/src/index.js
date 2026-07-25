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
  scheduleRoomDeletion,
  reclaimRoom,
} = require('./rooms');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5173';
const HOST_DISCONNECT_GRACE_MS = 20_000;

// Room state is in-memory only, so when a station "just dies" the cause is
// almost always invisible after the fact. These lines are the difference
// between diagnosing that and guessing at it.
function log(event, roomId) {
  console.log(`[${new Date().toISOString()}] ${event}${roomId ? ` room=${roomId}` : ''}`);
}

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
    const { roomId, hostToken } = createRoom(socket.id);
    socket.join(roomId);
    log('room created', roomId);
    if (typeof ack === 'function') ack({ roomId, hostToken });
  });

  socket.on('room:reclaim', ({ roomId, hostToken } = {}, ack) => {
    const room = reclaimRoom(roomId, hostToken, socket.id);
    if (!room) {
      log('reclaim refused (room gone or bad token)', roomId);
      if (typeof ack === 'function') ack({ ok: false, error: 'room_not_found' });
      return;
    }
    socket.join(roomId);
    log('host reclaimed', roomId);
    if (typeof ack === 'function') ack({ ok: true, lastState: room.lastState });
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
      // Give the host a window to reconnect and reclaim (network blip, backgrounded
      // tab, page refresh) before telling listeners the broadcast really ended.
      log('host dropped, grace period started', hostedRoomId);
      scheduleRoomDeletion(hostedRoomId, HOST_DISCONNECT_GRACE_MS, () => {
        log('grace expired, room closed', hostedRoomId);
        io.to(hostedRoomId).emit('host:left', {});
      });
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
