import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';

const SAMPLES_PER_ROUND = 5;
const RESAMPLE_INTERVAL_MS = 60_000;

/**
 * Works out how far this device's clock sits from the station's.
 *
 * Without it, "the song started at 10:04:31" is measured against a phone clock
 * that may be seconds out, and the reply itself takes time to arrive — so every
 * listener lands somewhere different. Each sample times the round trip and
 * assumes the delay was split evenly between the two legs, which is close enough
 * when the fastest samples are the ones kept.
 */
function measureOnce() {
  return new Promise((resolve) => {
    const sentAt = Date.now();
    socket.timeout(4000).emit('time:sync', {}, (err, res) => {
      if (err || !res?.serverTime) {
        resolve(null);
        return;
      }
      const receivedAt = Date.now();
      const roundTrip = receivedAt - sentAt;
      resolve({
        roundTrip,
        // Server's clock at the moment we received, minus ours.
        offset: res.serverTime + roundTrip / 2 - receivedAt,
      });
    });
  });
}

function useServerClock() {
  const offsetRef = useRef(0);
  const [synced, setSynced] = useState(false);
  const [quality, setQuality] = useState(null);

  const resample = useCallback(async () => {
    if (!socket.connected) return;

    const samples = [];
    for (let i = 0; i < SAMPLES_PER_ROUND; i++) {
      const sample = await measureOnce();
      if (sample) samples.push(sample);
      await new Promise((r) => setTimeout(r, 120));
    }
    if (samples.length === 0) return;

    // The quickest round trip is the least distorted by queueing and dozing
    // radios, so it carries the most trustworthy offset. Averaging would let
    // the worst samples drag the answer around.
    samples.sort((a, b) => a.roundTrip - b.roundTrip);
    offsetRef.current = samples[0].offset;
    setQuality(Math.round(samples[0].roundTrip));
    setSynced(true);
  }, []);

  useEffect(() => {
    resample();
    const onConnect = () => resample();
    socket.on('connect', onConnect);

    // Phone clocks wander, and a device that has been asleep comes back wrong.
    const interval = setInterval(resample, RESAMPLE_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') resample();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      socket.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resample]);

  /** This device's best guess at the station's current time. */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { serverNow, synced, roundTripMs: quality };
}

export { useServerClock };
