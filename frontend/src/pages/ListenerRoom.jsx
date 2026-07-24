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

function ListenerRoom({ roomId }) {
  const { activate, deviceId, playerState, error, isActive, setLocalVolume } = useSpotifyPlayer();
  const [joinState, setJoinState] = useState({ joined: false, initialState: null, joinError: null });
  const listenerCount = usePresence();

  useEffect(() => {
    if (!isActive || !deviceId || joinState.joined) return;

    if (!socket.connected) socket.connect();

    socket.emit('room:join', { roomId }, (res) => {
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
      socket.emit('room:join', { roomId }, (res) => {
        if (!res?.ok) return;
        setJoinState({ joined: true, initialState: res.lastState, joinError: null });
      });
    }
    socket.io.on('reconnect', onReconnect);
    return () => socket.io.off('reconnect', onReconnect);
  }, [roomId, deviceId]);

  const { hostState, hostLeft } = useListenerSync(deviceId, playerState, joinState.initialState);

  if (!isLoggedIn()) {
    return (
      <div className="room room--listener">
        <h1 className="room__title">You're invited to tune in</h1>
        <button className="landing__button" onClick={() => login(`/room/${roomId}`)}>
          Connect Spotify
        </button>
        <p className="landing__hint">Requires Spotify Premium.</p>
      </div>
    );
  }

  return (
    <div className="room room--listener">
      <h1 className="room__title">Tuned In</h1>
      <PresenceList listenerCount={listenerCount} />

      {!isActive ? (
        <button className="room__activate" onClick={activate}>
          Tune In
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
        <p className="room__error">Couldn't join this station: {joinState.joinError}</p>
      )}
      {error && <p className="room__error">{error}</p>}
    </div>
  );
}

export default ListenerRoom;
