const { customAlphabet } = require('nanoid');

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// roomId -> { hostSocketId, listeners: Set<socketId>, lastState: object|null }
const rooms = new Map();

function createRoom(hostSocketId) {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) {
    roomId = generateRoomId();
  }
  rooms.set(roomId, { hostSocketId, listeners: new Set(), lastState: null });
  return roomId;
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
};
