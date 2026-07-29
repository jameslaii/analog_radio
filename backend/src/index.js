require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const {
  createRoom,
  getRoom,
  addListener,
  removeListener,
  enqueue,
  removeQueued,
  advance,
  setNowPlayingDuration,
  shouldAutoSkip,
  addMessage,
  recentMessages,
  rate,
  serialize,
  sweepIdleRooms,
} = require('./rooms');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5173';
const IDLE_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function log(event, roomId, extra = '') {
  console.log(
    `[${new Date().toISOString()}] ${event}${roomId ? ` room=${roomId}` : ''}${extra ? ` ${extra}` : ''}`
  );
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Search runs through here rather than from the browser so the API key stays on
// the server. A key shipped in frontend JavaScript is readable by anyone who
// opens the station, and quota spent by a stranger is quota the room doesn't get.
const YT_KEY = process.env.YOUTUBE_API_KEY || '';

// YouTube returns titles HTML-escaped, so an apostrophe arrives as &#39; and
// would otherwise be displayed literally in the queue.
function decodeHtml(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

app.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: [] });
  if (!YT_KEY) return res.status(501).json({ error: 'search_not_configured' });

  try {
    const params = new URLSearchParams({
      key: YT_KEY,
      q,
      part: 'snippet',
      type: 'video',
      maxResults: '8',
      // Videos the owner has blocked from embedding can't play here at all, so
      // there's no reason to offer them.
      videoEmbeddable: 'true',
    });
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!searchRes.ok) {
      const detail = await searchRes.text().catch(() => '');
      log('search failed', null, `${searchRes.status} ${detail.slice(0, 200)}`);
      return res.status(502).json({ error: 'search_failed', status: searchRes.status });
    }

    const data = await searchRes.json();
    const results = (data.items || [])
      .filter((i) => i.id?.videoId)
      .map((i) => ({
        videoId: i.id.videoId,
        title: decodeHtml(i.snippet?.title || 'Untitled'),
        channel: decodeHtml(i.snippet?.channelTitle || ''),
        thumbnail: i.snippet?.thumbnails?.default?.url || null,
      }));

    res.json({ results });
  } catch (err) {
    log('search error', null, err.message);
    res.status(502).json({ error: 'search_failed' });
  }
});

// A playlist is the one thing people already have that this app can't read: a
// link to fifty tracks currently queues one of them. Importing needs the API —
// there's no keyless equivalent of oEmbed for a playlist's contents — so it
// degrades the same way search does rather than failing loudly.
const PLAYLIST_PAGE_SIZE = 50;
const MAX_PLAYLIST_TRACKS = 100;

app.get('/playlist', async (req, res) => {
  const listId = (req.query.list || '').toString().trim();
  if (!listId) return res.json({ tracks: [] });
  if (!YT_KEY) return res.status(501).json({ error: 'playlist_not_configured' });

  try {
    const tracks = [];
    let pageToken = '';

    while (tracks.length < MAX_PLAYLIST_TRACKS) {
      const params = new URLSearchParams({
        key: YT_KEY,
        playlistId: listId,
        part: 'snippet,status',
        maxResults: String(PLAYLIST_PAGE_SIZE),
      });
      if (pageToken) params.set('pageToken', pageToken);

      const listRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
      if (!listRes.ok) {
        const detail = await listRes.text().catch(() => '');
        log('playlist failed', null, `${listRes.status} ${detail.slice(0, 200)}`);
        // A private or nonexistent playlist is the caller's problem to explain,
        // not a fault worth retrying.
        const notReadable = listRes.status === 403 || listRes.status === 404;
        return res.status(notReadable ? 404 : 502).json({
          error: notReadable ? 'playlist_not_readable' : 'playlist_failed',
        });
      }

      const data = await listRes.json();
      for (const item of data.items || []) {
        const videoId = item.snippet?.resourceId?.videoId;
        // Playlists keep tombstones for videos that have gone private or been
        // deleted. They still come back from the API, and queueing them would
        // just stall the station on something nobody can hear.
        const privacy = item.status?.privacyStatus;
        if (!videoId || privacy === 'private' || privacy === 'privacyStatusUnspecified') continue;

        const title = decodeHtml(item.snippet?.title || 'Untitled');
        if (title === 'Deleted video' || title === 'Private video') continue;

        tracks.push({ videoId, title });
        if (tracks.length >= MAX_PLAYLIST_TRACKS) break;
      }

      pageToken = data.nextPageToken || '';
      if (!pageToken) break;
    }

    log('playlist read', null, `${listId} -> ${tracks.length} tracks`);
    res.json({ tracks });
  } catch (err) {
    log('playlist error', null, err.message);
    res.status(502).json({ error: 'playlist_failed' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  // A phone that locks or a tab that goes to the background stops sending
  // heartbeats long before the person has actually left.
  pingInterval: 25_000,
  pingTimeout: 60_000,
});

function broadcast(roomId) {
  const state = serialize(roomId);
  if (state) io.to(roomId).emit('station:state', state);
}

/**
 * Drives the station forward on its own. Because the server holds the clock
 * rather than a host's browser, the queue keeps playing whether anyone's tab is
 * open or not — which is what stops one person leaving from ending the night.
 */
function scheduleAdvance(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  clearTimeout(room.advanceTimer);
  if (!room.nowPlaying) return;

  // Duration arrives from whoever loads the video first. Until then there is no
  // honest end time to schedule against, and guessing one would cut the track
  // off mid-song.
  if (!(room.nowPlaying.durationMs > 0)) return;

  const elapsed = Date.now() - room.nowPlaying.startedAtMs;
  const remaining = Math.max(room.nowPlaying.durationMs - elapsed, 0);

  room.advanceTimer = setTimeout(() => {
    const next = advance(roomId);
    log(next ? 'advanced' : 'queue empty', roomId, next ? `-> ${next.title}` : '');
    broadcast(roomId);
    scheduleAdvance(roomId);
  }, remaining + 500);
}

/** Starts playback if the station is idle and something just landed in the queue. */
function startIfIdle(roomId) {
  const room = getRoom(roomId);
  if (!room || room.nowPlaying || room.queue.length === 0) return;
  advance(roomId);
  scheduleAdvance(roomId);
}

io.on('connection', (socket) => {
  let joinedRoom = null;
  let listenerName = 'someone';
  let lastMessageAt = 0;

  // Every listener is running its own slightly-wrong clock, and phones drift
  // more than most. Handing out the server's time lets each one work out how
  // far off it is, so "four minutes into the song" means the same instant on
  // all of them rather than four different instants.
  socket.on('time:sync', (_payload, ack) => {
    if (typeof ack === 'function') ack({ serverTime: Date.now() });
  });

  socket.on('station:create', (_payload, ack) => {
    const roomId = createRoom();
    log('station created', roomId);
    if (typeof ack === 'function') ack({ roomId });
  });

  socket.on('station:join', ({ roomId, name } = {}, ack) => {
    listenerName = (name || '').trim() || 'someone';
    const room = addListener(roomId, socket.id, listenerName);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'station_not_found' });
      return;
    }
    joinedRoom = roomId;
    socket.join(roomId);
    log('listener joined', roomId, `(${room.listeners.size} present)`);
    // Chat arrives once here and then message by message. Replaying the whole
    // log on every rating and track change would be a lot of traffic for a
    // conversation that only ever grows at one end.
    if (typeof ack === 'function') {
      ack({ ok: true, state: serialize(roomId), messages: recentMessages(roomId) });
    }
    broadcast(roomId);
  });

  socket.on('chat:send', ({ roomId, text } = {}) => {
    if (!getRoom(roomId) || roomId !== joinedRoom) return;

    // A light throttle: enough to stop a stuck key flooding the room, loose
    // enough that nobody typing normally will ever notice it.
    const now = Date.now();
    if (now - lastMessageAt < 400) return;

    const message = addMessage(roomId, { name: listenerName, text });
    if (!message) return;
    lastMessageAt = now;
    io.to(roomId).emit('chat:message', message);
  });

  socket.on('queue:add', ({ roomId, videoId, title, durationMs, addedBy } = {}, ack) => {
    if (!getRoom(roomId) || !videoId) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    const item = enqueue(roomId, { videoId, title, durationMs, addedBy });
    log('queued', roomId, `${title} (by ${item.addedBy})`);
    startIfIdle(roomId);
    broadcast(roomId);
    if (typeof ack === 'function') ack({ ok: true, item });
  });

  // A playlist arrives as one event rather than fifty. Sent one at a time it
  // would be fifty full state broadcasts to everyone in the room for a single
  // paste, and the queue would visibly crawl into place.
  socket.on('queue:addMany', ({ roomId, tracks, addedBy } = {}, ack) => {
    if (!getRoom(roomId) || !Array.isArray(tracks) || tracks.length === 0) {
      if (typeof ack === 'function') ack({ ok: false, added: 0 });
      return;
    }

    let added = 0;
    for (const track of tracks.slice(0, MAX_PLAYLIST_TRACKS)) {
      if (!track?.videoId) continue;
      enqueue(roomId, {
        videoId: track.videoId,
        title: track.title,
        durationMs: track.durationMs,
        addedBy,
      });
      added += 1;
    }

    if (added === 0) {
      if (typeof ack === 'function') ack({ ok: false, added: 0 });
      return;
    }

    log('playlist queued', roomId, `${added} tracks (by ${addedBy || 'someone'})`);
    startIfIdle(roomId);
    broadcast(roomId);
    if (typeof ack === 'function') ack({ ok: true, added });
  });

  socket.on('queue:remove', ({ roomId, itemId } = {}) => {
    if (removeQueued(roomId, itemId)) broadcast(roomId);
  });

  // Anyone can skip. In a room of friends the person who put a track on is
  // usually the first to admit it isn't landing, and making that a negotiation
  // costs more than the occasional lost song.
  socket.on('playback:skip', ({ roomId } = {}) => {
    const room = getRoom(roomId);
    if (!room || !room.nowPlaying) return;
    advance(roomId);
    log('skipped', roomId);
    scheduleAdvance(roomId);
    broadcast(roomId);
  });

  // Reported by whichever player reaches the end first. Guarded by the track id
  // so a straggler finishing the previous song can't skip the current one.
  socket.on('track:ended', ({ roomId, itemId } = {}) => {
    const room = getRoom(roomId);
    if (!room || !room.nowPlaying || room.nowPlaying.id !== itemId) return;
    advance(roomId);
    log('track ended', roomId);
    scheduleAdvance(roomId);
    broadcast(roomId);
  });

  socket.on('track:duration', ({ roomId, itemId, durationMs } = {}) => {
    if (!setNowPlayingDuration(roomId, itemId, durationMs)) return;
    scheduleAdvance(roomId);
    broadcast(roomId);
  });

  // A track nobody can play would otherwise hold the station hostage until its
  // (unknown) duration elapsed, so the first player to be refused moves it on.
  socket.on('track:unplayable', ({ roomId, itemId } = {}) => {
    const room = getRoom(roomId);
    if (!room || !room.nowPlaying || room.nowPlaying.id !== itemId) return;
    log('unplayable, skipping', roomId, room.nowPlaying.title);
    advance(roomId);
    scheduleAdvance(roomId);
    broadcast(roomId);
  });

  socket.on('track:rate', ({ roomId, itemId, value } = {}) => {
    const room = getRoom(roomId);
    if (!room || (value !== 1 && value !== -1)) return;
    rate(roomId, itemId, socket.id, value);

    // A vote that only moves a counter is decoration. If the room has turned on
    // this track, it ends here rather than making someone step in and be the one
    // who killed it.
    if (room.nowPlaying?.id === itemId && shouldAutoSkip(room)) {
      log('voted off', roomId, room.nowPlaying.title);
      advance(roomId);
      scheduleAdvance(roomId);
    }

    broadcast(roomId);
  });

  // Clients drift, buffer, and get throttled in background tabs, so they ask for
  // the truth rather than assuming their own position is right.
  socket.on('playback:resync', ({ roomId } = {}, ack) => {
    if (typeof ack === 'function') ack(serialize(roomId));
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    removeListener(joinedRoom, socket.id);
    log('listener left', joinedRoom);
    broadcast(joinedRoom);
  });
});

setInterval(() => {
  for (const roomId of sweepIdleRooms(IDLE_ROOM_TTL_MS)) log('idle station reclaimed', roomId);
}, SWEEP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`analog radio relay listening on :${PORT}`);
});
