const { customAlphabet } = require('nanoid');

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const generateHostToken = customAlphabet(
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789',
  24
);

// roomId -> { hostSocketId, hostToken, listeners: Set<socketId>, lastState: object|null, deletionTimer }
const rooms = new Map();

function createRoom(hostSocketId) {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) {
    roomId = generateRoomId();
  }
  const hostToken = generateHostToken();
  rooms.set(roomId, {
    hostSocketId,
    hostToken,
    listeners: new Set(),
    lastState: null,
    deletionTimer: null,
  });
  return { roomId, hostToken };
}

// Called on host disconnect instead of deleting immediately — a brief network
// blip, a backgrounded mobile tab, or the host's page reload would otherwise
// kill the room before they get a chance to reconnect. `onExpire` fires only if
// the host never reclaims the room within the grace window.
function scheduleRoomDeletion(roomId, graceMs, onExpire) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.deletionTimer);
  room.deletionTimer = setTimeout(() => {
    if (rooms.has(roomId)) {
      deleteRoom(roomId);
      onExpire();
    }
  }, graceMs);
}

// Re-associates a room with a new socket after the host reconnects, provided
// they can prove they're the original host and the grace window hasn't expired.
function reclaimRoom(roomId, hostToken, newHostSocketId) {
  const room = rooms.get(roomId);
  if (!room || room.hostToken !== hostToken) return null;
  clearTimeout(room.deletionTimer);
  room.deletionTimer = null;
  room.hostSocketId = newHostSocketId;
  return room;
}

function joinRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.listeners.add(socketId);
  return room;
}

function leaveRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.listeners.delete(socketId);
}

function findRoomByHostSocket(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.hostSocketId === socketId) return roomId;
  }
  return null;
}

function findRoomsByListenerSocket(socketId) {
  const found = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.listeners.has(socketId)) found.push(roomId);
  }
  return found;
}

function setLastState(roomId, state) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastState = state;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = {
  rooms,
  createRoom,
  joinRoom,
  leaveRoom,
  findRoomByHostSocket,
  findRoomsByListenerSocket,
  setLastState,
  getRoom,
  deleteRoom,
  scheduleRoomDeletion,
  reclaimRoom,
};
