import { useEffect, useState } from 'react';
import { login, isLoggedIn } from '../spotify/spotifyAuth';
import { useSpotifyPlayer } from '../spotify/useSpotifyPlayer';
import { useListenerSync } from '../sync/useListenerSync';
import { usePresence } from '../sync/usePresence';
import { socket } from '../sync/socket';
import TuningDial from '../components/TuningDial';
import VolumeKnob from '../components/VolumeKnob';
import FrequencyDisplay from '../components/FrequencyDisplay';
import OnAirIndicator from '../components/OnAirIndicator';
import PresenceList from '../components/PresenceList';

/** Turns a server join error code (or a client-side timeout) into a message a non-technical friend can act on. */
function describeJoinError(code) {
  switch (code) {
    case 'room_not_found':
      return "This station link is invalid or the broadcast has ended. Ask your friend to send you a fresh link.";
    case 'timeout':
      return "Couldn't reach the sync server. Check your connection and refresh the page to try again.";
    default:
      return "Something went wrong joining this station. Try refreshing the page.";
  }
}

function ListenerRoom({ roomId }) {
  const { activate, deviceId, playerState, error, isActive, setLocalVolume } = useSpotifyPlayer();
  const [joinState, setJoinState] = useState({ joined: false, initialState: null, joinError: null });
  const [activating, setActivating] = useState(false);
  const listenerCount = usePresence();

  useEffect(() => {
    if (!isActive || !deviceId || joinState.joined) return;

    if (!socket.connected) socket.connect();

    socket.timeout(8000).emit('room:join', { roomId }, (timeoutErr, res) => {
      if (timeoutErr) {
        setJoinState({ joined: false, initialState: null, joinError: 'timeout' });
        return;
      }
      if (!res?.ok) {
        setJoinState({ joined: false, initialState: null, joinError: res?.error ?? 'unknown_error' });
        return;
      }
      setJoinState({ joined: true, initialState: res.lastState, joinError: null });
    });
  }, [isActive, deviceId, roomId, joinState.joined]);

  // A dropped connection gets a new socket.id on reconnect, so the server's room
  // membership needs to be re-established rather than assumed to still hold.
  useEffect(() => {
    function onReconnect() {
      if (!deviceId) return;
      socket.timeout(8000).emit('room:join', { roomId }, (timeoutErr, res) => {
        if (timeoutErr || !res?.ok) {
          setJoinState((prev) => ({
            ...prev,
            joined: false,
            joinError: timeoutErr ? 'timeout' : res?.error ?? 'unknown_error',
          }));
          return;
        }
        setJoinState({ joined: true, initialState: res.lastState, joinError: null });
      });
    }
    socket.io.on('reconnect', onReconnect);
    return () => socket.io.off('reconnect', onReconnect);
  }, [roomId, deviceId]);

  // One button, one verb, the whole way through: not logged in yet -> Spotify
  // handles the (one-time, usually instant if already signed in there) hand-off;
  // logged in but not active -> activate this browser as the listening device.
  // Either way the friend just clicks "Tune In" and never sees the word "Spotify"
  // as a separate step of its own.
  async function handleTuneIn() {
    setActivating(true);
    if (!isLoggedIn()) {
      await login(`/room/${roomId}`);
      return;
    }
    try {
      await activate();
    } finally {
      setActivating(false);
    }
  }

  const { hostState, hostLeft } = useListenerSync(deviceId, playerState, joinState.initialState);

  if (!isLoggedIn()) {
    return (
      <div className="room room--listener">
        <h1 className="room__title">You're invited to tune in</h1>
        <button className="room__activate" onClick={handleTuneIn} disabled={activating}>
          {activating ? 'Tuning in…' : 'Tune In'}
        </button>
        <p className="landing__hint">Requires Spotify Premium.</p>
      </div>
    );
  }

  return (
    <div className="room room--listener">
      <h1 className="room__title">{isActive ? 'Tuned In' : 'Ready to Tune In'}</h1>
      <PresenceList listenerCount={listenerCount} />

      {!isActive ? (
        <button className="room__activate" onClick={handleTuneIn} disabled={activating}>
          {activating ? 'Tuning in…' : 'Tune In'}
        </button>
      ) : (
        <div className="radio-console">
          <OnAirIndicator isLive={hostState ? !hostState.isPaused : false} />
          <TuningDial
            positionMs={playerState?.positionMs}
            durationMs={playerState?.durationMs}
            isPaused={hostState?.isPaused ?? true}
          />
          <FrequencyDisplay trackName={hostState?.trackName} artistName={hostState?.artistName} />
          <VolumeKnob onChange={setLocalVolume} />
        </div>
      )}

      {hostLeft && <p className="room__error">The host has gone off air.</p>}
      {joinState.joinError && (
        <p className="room__error">{describeJoinError(joinState.joinError)}</p>
      )}
      {error && <p className="room__error">{error}</p>}
    </div>
  );
}

export default ListenerRoom;
