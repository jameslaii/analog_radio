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

// --- nobody gets to own the night ---
{
  const [x, y] = [await connect(), await connect()];
  const room = (await emit(x, 'station:create', {})).roomId;
  await emit(x, 'station:join', { roomId: room, name: 'James' });
  await emit(y, 'station:join', { roomId: room, name: 'Rosina' });

  // James pastes a playlist; the first track starts, six wait.
  await emit(x, 'queue:addMany', {
    roomId: room,
    addedBy: 'James',
    tracks: Array.from({ length: 7 }, (_, i) => ({
      videoId: `j${String(i).repeat(10)}`,
      title: `James ${i + 1}`,
    })),
  });
  await wait(300);

  let s = await emit(x, 'playback:resync', { roomId: room });
  check('a playlist starts the station on its first track', s.nowPlaying?.title === 'James 1');
  check('the rest of the playlist waits in the queue', s.queue.length === 6);

  await emit(y, 'queue:add', { roomId: room, videoId: 'r0000000000', title: 'Rosina 1', addedBy: 'Rosina' });
  await wait(200);
  s = await emit(y, 'playback:resync', { roomId: room });
  check(
    'one track queued behind a playlist goes next, not eighth',
    s.queue[0]?.title === 'Rosina 1',
    s.queue.map((i) => i.title).join(', ')
  );

  await emit(y, 'queue:add', { roomId: room, videoId: 'r1111111111', title: 'Rosina 2', addedBy: 'Rosina' });
  await wait(200);
  s = await emit(y, 'playback:resync', { roomId: room });
  check(
    'two people alternate rather than queueing in blocks',
    s.queue.slice(0, 4).map((i) => i.title).join('|') === 'Rosina 1|James 2|Rosina 2|James 3',
    s.queue.map((i) => i.title).join(', ')
  );
  check(
    'and the long tail follows once the other person runs out',
    s.queue.slice(4).map((i) => i.title).join('|') === 'James 4|James 5|James 6|James 7'
  );
  check(
    "one person's own tracks stay in the order they chose",
    s.queue.filter((i) => i.addedBy === 'James').map((i) => i.title).join('|') ===
      'James 2|James 3|James 4|James 5|James 6|James 7'
  );

  x.emit('track:ended', { roomId: room, itemId: s.nowPlaying.id });
  await wait(350);
  s = await emit(x, 'playback:resync', { roomId: room });
  check(
    "someone's first track is heard before the playlist's second",
    s.nowPlaying?.title === 'Rosina 1'
  );
  x.emit('track:ended', { roomId: room, itemId: s.nowPlaying.id });
  await wait(350);
  s = await emit(x, 'playback:resync', { roomId: room });
  check('and then it is the other person again', s.nowPlaying?.title === 'James 2');

  const empty = await emit(x, 'queue:addMany', { roomId: room, addedBy: 'James', tracks: [] });
  check('an empty playlist is refused rather than queued', empty?.ok === false);

  x.close();
  y.close();
}

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

// --- the room can vote a track off ---
{
  const [x, y, z] = [await connect(), await connect(), await connect()];
  const room = (await emit(x, 'station:create', {})).roomId;
  for (const [sock, who] of [[x, 'X'], [y, 'Y'], [z, 'Z']]) {
    await emit(sock, 'station:join', { roomId: room, name: who });
  }
  await emit(x, 'queue:add', { roomId: room, videoId: 'ddddddddddd', title: 'Divisive', addedBy: 'X' });
  await emit(x, 'queue:add', { roomId: room, videoId: 'eeeeeeeeeee', title: 'Next Up', addedBy: 'Y' });
  await wait(300);

  let s = await emit(x, 'playback:resync', { roomId: room });
  const divisiveId = s.nowPlaying.id;

  y.emit('track:rate', { roomId: room, itemId: divisiveId, value: -1 });
  await wait(300);
  s = await emit(x, 'playback:resync', { roomId: room });
  check('one dislike is not enough to end a track', s.nowPlaying.title === 'Divisive');

  z.emit('track:rate', { roomId: room, itemId: divisiveId, value: -1 });
  await wait(400);
  s = await emit(x, 'playback:resync', { roomId: room });
  check('enough dislikes ends the track', s.nowPlaying.title === 'Next Up');

  // Someone enjoying it should hold the line against a single detractor.
  const nextId = s.nowPlaying.id;
  x.emit('track:rate', { roomId: room, itemId: nextId, value: 1 });
  y.emit('track:rate', { roomId: room, itemId: nextId, value: 1 });
  z.emit('track:rate', { roomId: room, itemId: nextId, value: -1 });
  await wait(400);
  s = await emit(x, 'playback:resync', { roomId: room });
  check('a track the room likes survives a dissenter', s.nowPlaying?.title === 'Next Up');

  [x, y, z].forEach((sk) => sk.close());
}

// --- dead air is filled by something the room liked ---
{
  const [x, y] = [await connect(), await connect()];
  const room = (await emit(x, 'station:create', {})).roomId;
  await emit(x, 'station:join', { roomId: room, name: 'X' });
  await emit(y, 'station:join', { roomId: room, name: 'Y' });

  // A rerun deliberately won't repeat anything from the last few tracks, so the
  // session needs some depth before there is anything eligible to bring back.
  for (const [id, title] of [
    ['fffffffffff', 'A Keeper'],
    ['hhhhhhhhhhh', 'Second'],
    ['iiiiiiiiiii', 'Third'],
    ['jjjjjjjjjjj', 'Fourth'],
  ]) {
    await emit(x, 'queue:add', { roomId: room, videoId: id, title, addedBy: 'X' });
  }
  await wait(300);

  let s = await emit(x, 'playback:resync', { roomId: room });
  const keeperId = s.nowPlaying.id;
  check('the session starts with the first queued track', s.nowPlaying.title === 'A Keeper');

  // Only the first one earns its way back.
  x.emit('track:rate', { roomId: room, itemId: keeperId, value: 1 });
  y.emit('track:rate', { roomId: room, itemId: keeperId, value: 1 });
  await wait(250);

  for (let i = 0; i < 4; i++) {
    s = await emit(x, 'playback:resync', { roomId: room });
    if (!s.nowPlaying) break;
    x.emit('track:ended', { roomId: room, itemId: s.nowPlaying.id });
    await wait(350);
  }

  s = await emit(x, 'playback:resync', { roomId: room });
  check('an empty queue replays a liked track instead of dead air', s.nowPlaying !== null);
  check('the rerun is the one the room liked', s.nowPlaying?.title === 'A Keeper');
  check('the rerun is marked as one', s.nowPlaying?.isRerun === true);
  check('the rerun keeps who originally added it', s.nowPlaying?.addedBy === 'X');

  x.close();
  y.close();
}

// --- an unloved track is not resurrected ---
{
  const x = await connect();
  const room = (await emit(x, 'station:create', {})).roomId;
  await emit(x, 'station:join', { roomId: room, name: 'X' });
  await emit(x, 'queue:add', { roomId: room, videoId: 'ggggggggggg', title: 'Unloved', addedBy: 'X' });
  await wait(300);
  const s0 = await emit(x, 'playback:resync', { roomId: room });
  x.emit('track:ended', { roomId: room, itemId: s0.nowPlaying.id });
  await wait(400);
  const s1 = await emit(x, 'playback:resync', { roomId: room });
  check('a track nobody rated is left alone', s1.nowPlaying === null);
  x.close();
}

// --- room talk ---
{
  const [x, y] = [await connect(), await connect()];
  const room = (await emit(x, 'station:create', {})).roomId;
  await emit(x, 'station:join', { roomId: room, name: 'James' });
  await emit(y, 'station:join', { roomId: room, name: 'Rosina' });

  const heard = new Promise((resolve) => y.once('chat:message', resolve));
  x.emit('chat:send', { roomId: room, text: 'this one goes hard' });
  const msg = await heard;
  check('a message reaches the other listener', msg?.text === 'this one goes hard');
  check('a message says who sent it', msg?.name === 'James');

  // Throttled, so a stuck key can't flood the room.
  x.emit('chat:send', { roomId: room, text: 'first' });
  x.emit('chat:send', { roomId: room, text: 'second' });
  await wait(400);

  // Someone arriving late should be able to follow what's been said.
  const z = await connect();
  const late = await emit(z, 'station:join', { roomId: room, name: 'Russell' });
  check('a late arrival is given the backlog', (late?.messages?.length ?? 0) >= 1);
  check(
    'the backlog is in the order it was said',
    late.messages[0].text === 'this one goes hard'
  );

  const before = late.messages.length;
  x.emit('chat:send', { roomId: room, text: '   ' });
  await wait(400);
  const after = await emit(z, 'playback:resync', { roomId: room });
  check('an empty message is ignored', Boolean(after));

  const rejoin = await emit(z, 'station:join', { roomId: room, name: 'Russell' });
  check('blank messages never made it into the log', rejoin.messages.length === before);

  [x, y, z].forEach((s) => s.close());
}

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
