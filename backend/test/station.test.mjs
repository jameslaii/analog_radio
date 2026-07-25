// Exercises the relay over a real socket, because the parts worth breaking are
// the ones that only exist between two clients: who is present, whose track is
// playing, and whether a late event from one listener disturbs everyone else.
import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = 3999;
const URL = `http://127.0.0.1:${PORT}`;
const here = dirname(fileURLToPath(import.meta.url));

const server = spawn(process.execPath, [join(here, '..', 'src', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), CORS_ORIGIN: '*' },
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${URL}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('relay did not start');
}
await waitForServer();

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
  });
}
function emit(sock, event, payload) {
  return new Promise((resolve) => sock.timeout(5000).emit(event, payload, (err, res) => resolve(err ? null : res)));
}
function nextState(sock) {
  return new Promise((resolve) => sock.once('station:state', resolve));
}

const a = await connect();
const b = await connect();

// --- create + join ---
const created = await emit(a, 'station:create', {});
check('station is created with an id', Boolean(created?.roomId), created?.roomId);
const roomId = created.roomId;

const joinA = await emit(a, 'station:join', { roomId, name: 'James' });
check('first listener joins', joinA?.ok === true);

const joinB = await emit(b, 'station:join', { roomId, name: 'Rosina' });
check('second listener joins', joinB?.ok === true);
check(
  'both names are visible to the room',
  joinB?.state?.listeners?.length === 2 && joinB.state.listeners.includes('James'),
  JSON.stringify(joinB?.state?.listeners)
);

const missing = await emit(a, 'station:join', { roomId: 'NOPE12', name: 'x' });
check('joining a dead station is refused', missing?.ok === false && missing.error === 'station_not_found');

// --- queueing ---
const stateAfterFirst = nextState(b);
await emit(a, 'queue:add', { roomId, videoId: 'aaaaaaaaaaa', title: 'First Song', addedBy: 'James' });
const s1 = await stateAfterFirst;
check('first queued track starts playing immediately', s1?.nowPlaying?.title === 'First Song');
check('now playing records who added it', s1?.nowPlaying?.addedBy === 'James');
check('queue is empty once the only track is playing', s1?.queue?.length === 0);

const stateAfterSecond = nextState(b);
await emit(b, 'queue:add', { roomId, videoId: 'bbbbbbbbbbb', title: 'Second Song', addedBy: 'Rosina' });
const s2 = await stateAfterSecond;
check('a second track waits in the queue', s2?.queue?.length === 1 && s2.queue[0].title === 'Second Song');
check('the playing track is not replaced', s2?.nowPlaying?.title === 'First Song');

// --- ratings ---
const playingId = s2.nowPlaying.id;
let rated = nextState(b);
a.emit('track:rate', { roomId, itemId: playingId, value: 1 });
let r1 = await rated;
check('a rating is counted', r1?.nowPlaying?.ratings?.up === 1);

rated = nextState(b);
b.emit('track:rate', { roomId, itemId: playingId, value: 1 });
r1 = await rated;
check('two people rating counts twice', r1?.nowPlaying?.ratings?.up === 2);

rated = nextState(b);
a.emit('track:rate', { roomId, itemId: playingId, value: 1 });
r1 = await rated;
check('tapping the same rating again takes it back', r1?.nowPlaying?.ratings?.up === 1);

rated = nextState(b);
b.emit('track:rate', { roomId, itemId: playingId, value: -1 });
r1 = await rated;
check('switching to a down-vote moves the count', r1?.nowPlaying?.ratings?.up === 0 && r1.nowPlaying.ratings.down === 1);

// --- advancing on the player's ended event ---
const advanced = nextState(b);
a.emit('track:ended', { roomId, itemId: playingId });
const s3 = await advanced;
check('ended track advances the station', s3?.nowPlaying?.title === 'Second Song');
check('finished track moves into history', s3?.history?.[0]?.title === 'First Song');
check('history keeps the ratings it earned', s3?.history?.[0]?.ratings?.down === 1);

// A late duplicate from another listener must not skip the new track.
b.emit('track:ended', { roomId, itemId: playingId });
await wait(300);
const afterDup = await emit(a, 'playback:resync', { roomId });
check('a stale ended event is ignored', afterDup?.nowPlaying?.title === 'Second Song');

// --- position clock ---
const t1 = await emit(a, 'playback:resync', { roomId });
await wait(1200);
const t2 = await emit(a, 'playback:resync', { roomId });
check(
  'the station clock advances on its own',
  t2.nowPlaying.positionMs > t1.nowPlaying.positionMs + 800,
  `${t1.nowPlaying.positionMs}ms -> ${t2.nowPlaying.positionMs}ms`
);

// --- skip to empty ---
const skipped = nextState(b);
a.emit('playback:skip', { roomId });
const s4 = await skipped;
check('skipping the last track leaves dead air', s4?.nowPlaying === null);

// --- presence on leave ---
const left = nextState(a);
b.close();
const s5 = await left;
check('leaving updates who is present', s5?.listeners?.length === 1 && s5.listeners[0] === 'James');

// --- queue survives an empty room ---
await emit(a, 'queue:add', { roomId, videoId: 'ccccccccccc', title: 'Later Song', addedBy: 'James' });
a.close();
await wait(400);
const c = await connect();
const rejoin = await emit(c, 'station:join', { roomId, name: 'James' });
check('station survives everyone leaving', rejoin?.ok === true);
check('and it is still playing what was queued', rejoin?.state?.nowPlaying?.title === 'Later Song');
c.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
server.kill();
process.exit(failed.length ? 1 : 0);
