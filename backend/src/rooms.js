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
function advance(roomId, { allowRerun = true } = {}) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.nowPlaying) room.history.unshift(room.nowPlaying);
  room.history = room.history.slice(0, 50);

  // Anything anyone actually chose comes first; a rerun is only ever what
  // happens instead of silence.
  const next = room.queue.shift() || (allowRerun ? pickRerun(roomId) : null);
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

/**
 * Whether the room has turned on the current track hard enough to cut it short.
 *
 * A rating that only increments a number is decoration; Turntable's worked
 * because enough dislikes actually ended the song. Two is the floor so one
 * person can't quietly veto for everyone — they have the skip button for that
 * — and it has to beat the people enjoying it.
 */
function shouldAutoSkip(room) {
  if (!room.nowPlaying) return false;
  const { up, down } = tallyRatings(room, room.nowPlaying.id);
  const present = Math.max(room.listeners.size, 1);
  return down >= 2 && down > up && down >= Math.ceil(present / 2);
}

/**
 * Something worth hearing again when the queue runs dry.
 *
 * Dead air is where a room quietly ends: the last track finishes, nobody is
 * paying enough attention to queue anything, and everyone drifts off. Turntable
 * died of exactly this — demanding constant attention from people who mostly
 * want music on in the background. A station that keeps playing something the
 * room already liked survives the lull instead of ending on it.
 */
function pickRerun(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const recentIds = new Set(room.history.slice(0, 3).map((i) => i.videoId));
  const liked = room.history
    .filter((i) => !recentIds.has(i.videoId))
    .map((i) => ({ item: i, net: tallyRatings(room, i.id).up - tallyRatings(room, i.id).down }))
    .filter((c) => c.net > 0)
    .sort((a, b) => b.net - a.net);

  if (liked.length === 0) return null;

  // Among equally liked tracks, vary it rather than looping the same favourite.
  const best = liked[0].net;
  const topTier = liked.filter((c) => c.net === best);
  const chosen = topTier[Math.floor(Math.random() * topTier.length)].item;

  return {
    ...chosen,
    id: generateItemId(),
    isRerun: true,
  };
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
    // startedAtMs is the station's actual reference point, in server time.
    // positionMs is only a snapshot, already stale by the time it lands, so
    // clients work out where they should be from startedAtMs against a clock
    // they've aligned to the server. Both are sent: the dial can use the
    // snapshot, but nothing that has to stay in step should.
    serverNow: Date.now(),
    nowPlaying: room.nowPlaying
      ? {
          ...withRatings(room.nowPlaying),
          startedAtMs: room.nowPlaying.startedAtMs,
          positionMs: Date.now() - room.nowPlaying.startedAtMs,
        }
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
  shouldAutoSkip,
  pickRerun,
  rate,
  serialize,
  deleteRoom,
  sweepIdleRooms,
};
