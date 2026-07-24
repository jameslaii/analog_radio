import { useEffect, useRef } from 'react';
import { socket } from './socket';

const BROADCAST_INTERVAL_MS = 1000;

/** Host-only: periodically broadcasts the host's live playback state to the room. */
function useHostBroadcaster(roomId, playerState) {
  const stateRef = useRef(playerState);
  stateRef.current = playerState;

  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(() => {
      const state = stateRef.current;
      if (!state) return;

      socket.emit('host:state', {
        roomId,
        state: {
          contextUri: state.contextUri,
          trackUri: state.trackUri,
          trackName: state.trackName,
          artistName: state.artistName,
          positionMs: state.positionMs,
          isPaused: state.isPaused,
          timestamp: Date.now(),
        },
      });
    }, BROADCAST_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [roomId]);
}

export { useHostBroadcaster };
