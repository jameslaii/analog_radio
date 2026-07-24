import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn } from '../spotify/spotifyAuth';
import { useSpotifyPlayer } from '../spotify/useSpotifyPlayer';
import { useHostBroadcaster } from '../sync/useHostBroadcaster';
import { usePresence } from '../sync/usePresence';
import { socket } from '../sync/socket';
import { play, pause, skipNext } from '../spotify/spotifyApi';
import PlaylistPicker from '../components/PlaylistPicker';
import TuningDial from '../components/TuningDial';
import VolumeKnob from '../components/VolumeKnob';
import FrequencyDisplay from '../components/FrequencyDisplay';
import OnAirIndicator from '../components/OnAirIndicator';
import PresenceList from '../components/PresenceList';

function HostRoom({ roomId }) {
  const navigate = useNavigate();
  const { activate, deviceId, playerState, error, isActive, setLocalVolume } = useSpotifyPlayer();
  const listenerCount = usePresence();
  const [nowPlayingName, setNowPlayingName] = useState(null);
  const [activating, setActivating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);

  useHostBroadcaster(roomId, playerState);

  const shareUrl = `${window.location.origin}/room/${roomId}`;

  async function handlePlayPlaylist(contextUri, name) {
    if (!deviceId) return;
    setActionError(null);
    setNowPlayingName(name);
    try {
      await play(deviceId, { contextUri, positionMs: 0 });
    } catch (err) {
      setActionError(err.message || "Couldn't start that playlist. Try again.");
    }
  }

  async function handlePauseToggle() {
    if (!deviceId) return;
    setActionError(null);
    try {
      if (playerState?.isPaused === false) {
        await pause(deviceId);
      } else if (playerState?.trackUri) {
        await play(deviceId, {
          contextUri: playerState.contextUri,
          offsetTrackUri: playerState.contextUri ? playerState.trackUri : undefined,
          uris: playerState.contextUri ? undefined : [playerState.trackUri],
          positionMs: playerState.positionMs,
        });
      }
    } catch (err) {
      setActionError(err.message || "Couldn't update playback. Try again.");
    }
  }

  async function handleSkip() {
    if (!deviceId) return;
    setActionError(null);
    try {
      await skipNext(deviceId);
    } catch (err) {
      setActionError(err.message || "Couldn't skip the track. Try again.");
    }
  }

  async function handleGoLive() {
    setActivating(true);
    try {
      await activate();
    } finally {
      setActivating(false);
    }
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="room room--host">
      <h1 className="room__title">Your Station</h1>

      <div className="room__share">
        <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        <button onClick={copyShareLink}>{linkCopied ? 'Copied!' : 'Copy link'}</button>
      </div>

      <PresenceList listenerCount={listenerCount} isHost />

      {!isActive ? (
        <button className="room__activate" onClick={handleGoLive} disabled={activating}>
          {activating ? 'Connecting…' : 'Go Live'}
        </button>
      ) : (
        <div className="radio-console">
          <OnAirIndicator isLive={playerState ? !playerState.isPaused : false} />
          <TuningDial
            positionMs={playerState?.positionMs}
            durationMs={playerState?.durationMs}
            isPaused={playerState?.isPaused ?? true}
          />
          <FrequencyDisplay
            trackName={playerState?.trackName ?? nowPlayingName}
            artistName={playerState?.artistName}
          />
          <VolumeKnob onChange={setLocalVolume} />

          <div className="room__controls">
            <button onClick={handlePauseToggle} disabled={!playerState?.trackUri}>
              {playerState?.isPaused === false ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleSkip} disabled={!playerState?.trackUri}>
              Skip
            </button>
          </div>

          <PlaylistPicker onPlay={handlePlayPlaylist} />
        </div>
      )}

      {error && <p className="room__error">{error}</p>}
      {actionError && <p className="room__error">{actionError}</p>}
    </div>
  );
}

export default HostRoom;
