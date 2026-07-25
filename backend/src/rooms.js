const { customAlphabet } = require('nanoid');

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const generateItemId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

// The station, not any one person's browser, is the source of truth for what is
// playing and how far into it we are. That is the whole reason this rewrite
// exists: previously playback lived in the host's tab, so the party ended
// whenever they closed it. Here a room keeps its own clock, and listeners are
// just windows onto it.
//
// roomId -> {
//   nowPlaying: { id, videoId, title, addedBy, durationMs, startedAtMs } | null,
//   queue: [ item ],
//   history: [ item ],
//   ratings: Map<itemId, Map<listenerId, 1 | -1>>,
//   listeners: Map<socketId, { name }>,
//   advanceTimer,
//   emptySince,
// }
const rooms = new Map();

function createRoom() {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) roomId = generateRoomId();

  rooms.set(roomId, {
    nowPlaying: null,
    queue: [],
    history: [],
    ratings: new Map(),
    listeners: new Map(),
    advanceTimer: null,
    emptySince: Date.now(),
  });
  return roomId;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function addListener(roomId, socketId, name) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.listeners.set(socketId, { name });
  room.emptySince = null;
  return room;
}

function removeListener(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.listeners.delete(socketId);
  // An empty station is kept alive rather than torn down; people wander off and
  // come back, and losing the queue in between is the thing that made the old
  // version feel fragile. A sweeper reclaims it much later.
  if (room.listeners.size === 0) room.emptySince = Date.now();
}

function enqueue(roomId, { videoId, title, durationMs, addedBy }) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const item = {
    id: generateItemId(),
    videoId,
    title,
    durationMs: durationMs || 0,
    addedBy: addedBy || 'someone',
  };
  room.queue.push(item);
  return item;
}

function removeQueued(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const before = room.queue.length;
  room.queue = room.queue.filter((i) => i.id !== itemId);
  return room.queue.length !== before;
}

/**
 * Moves the next queued track into the now-playing slot and stamps it with the
 * moment it started. Listeners derive their own position from that stamp, which
 * is what keeps a late arrival landing in the middle of a song rather than
 * restarting it for everyone.
 */
function advance(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.nowPlaying) room.history.unshift(room.nowPlaying);
  room.history = room.history.slice(0, 50);

  const next = room.queue.shift() || null;
  room.nowPlaying = next ? { ...next, startedAtMs: Date.now() } : null;
  return room.nowPlaying;
}

/**
 * A queued link carries no duration — that only exists once a player has the
 * video open. The first listener to load it tells the station how long it runs,
 * which is what lets the server know when to move on.
 */
function setNowPlayingDuration(roomId, itemId, durationMs) {
  const room = rooms.get(roomId);
  if (!room || !room.nowPlaying || room.nowPlaying.id !== itemId) return false;
  if (room.nowPlaying.durationMs > 0 || !(durationMs > 0)) return false;
  room.nowPlaying.durationMs = durationMs;
  return true;
}

function rate(roomId, itemId, listenerId, value) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (!room.ratings.has(itemId)) room.ratings.set(itemId, new Map());
  const forItem = room.ratings.get(itemId);

  // Tapping the same rating twice takes it back, so a rating is always
  // something a person currently means rather than something they once tapped.
  if (forItem.get(listenerId) === value) forItem.delete(listenerId);
  else forItem.set(listenerId, value);

  return tallyRatings(room, itemId);
}

function tallyRatings(room, itemId) {
  const forItem = room.ratings.get(itemId);
  if (!forItem) return { up: 0, down: 0 };
  let up = 0;
  let down = 0;
  for (const v of forItem.values()) {
    if (v === 1) up += 1;
    else if (v === -1) down += 1;
  }
  return { up, down };
}

/** Everything a client needs to render the station and place itself in the song. */
function serialize(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const withRatings = (item) => ({ ...item, ratings: tallyRatings(room, item.id) });

  return {
    roomId,
    nowPlaying: room.nowPlaying
      ? { ...withRatings(room.nowPlaying), positionMs: Date.now() - room.nowPlaying.startedAtMs }
      : null,
    queue: room.queue.map(withRatings),
    history: room.history.slice(0, 10).map(withRatings),
    listeners: [...room.listeners.values()].map((l) => l.name),
  };
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) clearTimeout(room.advanceTimer);
  rooms.delete(roomId);
}

/** Reclaims stations that nobody has been in for a while. */
function sweepIdleRooms(maxIdleMs) {
  const now = Date.now();
  const reclaimed = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.emptySince && now - room.emptySince > maxIdleMs) {
      deleteRoom(roomId);
      reclaimed.push(roomId);
    }
  }
  return reclaimed;
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  addListener,
  removeListener,
  enqueue,
  removeQueued,
  advance,
  setNowPlayingDuration,
  rate,
  serialize,
  deleteRoom,
  sweepIdleRooms,
};
