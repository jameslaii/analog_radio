import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import { play, pause, seek } from '../spotify/spotifyApi';

const DRIFT_THRESHOLD_MS = 400;
const RECHECK_INTERVAL_MS = 2000;
const MIN_CORRECTION_GAP_MS = 1500;

function estimatePositionMs(hostState) {
  if (!hostState) return 0;
  if (hostState.isPaused) return hostState.positionMs;
  return hostState.positionMs + (Date.now() - hostState.timestamp);
}

/**
 * Listener-only: tracks the host's broadcast playback state and issues
 * correcting Spotify Web API calls against the listener's own device to
 * stay in sync (track changes, pause/resume, and position drift).
 */
function useListenerSync(deviceId, localPlayerState, initialHostState) {
  const [hostState, setHostState] = useState(initialHostState ?? null);
  const [hostLeft, setHostLeft] = useState(false);
  const deviceIdRef = useRef(deviceId);
  const localStateRef = useRef(localPlayerState);
  const lastCorrectionRef = useRef(0);

  deviceIdRef.current = deviceId;
  localStateRef.current = localPlayerState;

  useEffect(() => {
    function onHostState(state) {
      setHostState(state);
    }
    function onHostLeft() {
      setHostLeft(true);
    }

    socket.on('host:state', onHostState);
    socket.on('host:left', onHostLeft);
    return () => {
      socket.off('host:state', onHostState);
      socket.off('host:left', onHostLeft);
    };
  }, []);

  useEffect(() => {
    async function reconcile(state) {
      const currentDeviceId = deviceIdRef.current;
      if (!state || !currentDeviceId) return;

      const now = Date.now();
      if (now - lastCorrectionRef.current < MIN_CORRECTION_GAP_MS) return;

      const local = localStateRef.current;
      const estimatedPosition = estimatePositionMs(state);

      try {
        if (!local || local.trackUri !== state.trackUri) {
          lastCorrectionRef.current = now;
          await play(currentDeviceId, {
            contextUri: state.contextUri ?? undefined,
            uris: state.contextUri ? undefined : [state.trackUri],
            offsetTrackUri: state.contextUri ? state.trackUri : undefined,
            positionMs: estimatedPosition,
          });
          return;
        }

        if (local.isPaused !== state.isPaused) {
          lastCorrectionRef.current = now;
          if (state.isPaused) {
            await pause(currentDeviceId);
          } else {
            await play(currentDeviceId, {
              contextUri: state.contextUri ?? undefined,
              uris: state.contextUri ? undefined : [state.trackUri],
              offsetTrackUri: state.contextUri ? state.trackUri : undefined,
              positionMs: estimatedPosition,
            });
          }
          return;
        }

        if (!state.isPaused && Math.abs(local.positionMs - estimatedPosition) > DRIFT_THRESHOLD_MS) {
          lastCorrectionRef.current = now;
          await seek(currentDeviceId, estimatedPosition);
        }
      } catch {
        // Best-effort sync; a transient failure will be retried on the next tick.
      }
    }

    reconcile(hostState);
    const interval = setInterval(() => reconcile(hostState), RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hostState]);

  return { hostState, hostLeft };
}

export { useListenerSync };
