/**
 * The sound a message makes when it lands.
 *
 * The chat sits below the console, so on a phone it is usually off screen while
 * the video is being watched — a line arriving there is otherwise completely
 * silent and completely invisible. A short blip is enough to say "someone said
 * something" without asking anyone to look away.
 *
 * It's synthesised rather than loaded from a file: a tenth of a second of sine
 * wave isn't worth a request, and building it here is what lets it stay quiet
 * enough to sit under whatever is playing rather than over it.
 */

const STORAGE_KEY = 'analog-radio:chat-sound';

// A room can get talkative, and three people answering at once is one event as
// far as anyone listening is concerned.
const MIN_GAP_MS = 250;

let context = null;
let lastPlayedAt = 0;
let muted = readStoredMute();

function readStoredMute() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    // Private browsing can refuse storage outright. Defaulting to audible means
    // the feature at least works; the preference just won't outlive the tab.
    return false;
  }
}

function isChimeMuted() {
  return muted;
}

function setChimeMuted(next) {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
  } catch {
    /* nothing to do — it holds for this tab either way */
  }
}

function audioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!context) context = new Ctx();

  // Browsers hand back a suspended context until the page has been interacted
  // with. Getting into a station takes a tap, so this has normally already been
  // earned by the time anyone says anything.
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/**
 * One short, soft blip.
 *
 * Callers are responsible for not ringing it at the person who typed — hearing
 * a notification for your own message is the fastest way to make someone turn
 * the sound off.
 */
function playChatChime() {
  if (muted) return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;

  try {
    const ctx = audioContext();
    if (!ctx) return;

    const at = ctx.currentTime;

    // A few milliseconds of attack and a decay to nothing. A square-edged
    // envelope on a tone this short is what makes it read as a fault rather
    // than a notification.
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);

    // Rolls the top off so it sits behind the music instead of cutting across
    // it — the station is the thing people came for.
    const softener = ctx.createBiquadFilter();
    softener.type = 'lowpass';
    softener.frequency.setValueAtTime(2400, at);

    softener.connect(envelope);
    envelope.connect(ctx.destination);

    // A fundamental with one quiet harmonic above it: still heard as a single
    // blip, but with enough body not to sound like a test tone.
    for (const [frequency, level] of [
      [784, 1],
      [1568, 0.25],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, at);

      const trim = ctx.createGain();
      trim.gain.setValueAtTime(level, at);

      osc.connect(trim);
      trim.connect(softener);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  } catch {
    // No audio available here. Silence is a perfectly acceptable outcome for a
    // notification sound, and not a reason to break the chat.
  }
}

export { playChatChime, isChimeMuted, setChimeMuted };
