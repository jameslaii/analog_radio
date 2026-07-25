import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn } from '../spotify/spotifyAuth';
import { useSpotifyPlayer } from '../spotify/useSpotifyPlayer';
import { useHostBroadcaster } from '../sync/useHostBroadcaster';
import { usePresence } from '../sync/usePresence';
import { socket } from '../sync/socket';
import { play, pause, skipNext, getPlaybackState } from '../spotify/spotifyApi';
import PlaylistPicker from '../components/PlaylistPicker';
import TuningDial from '../components/TuningDial';
import VolumeKnob from '../components/VolumeKnob';
import FrequencyDisplay from '../components/FrequencyDisplay';
import OnAirIndicator from '../components/OnAirIndicator';
import PresenceList from '../components/PresenceList';

function HostRoom({ roomId, hostToken }) {
  const navigate = useNavigate();
  const { activate, unlockAudio, deviceId, playerState, error, isActive, setLocalVolume } =
    useSpotifyPlayer();
  const listenerCount = usePresence();
  const [nowPlayingName, setNowPlayingName] = useState(null);
  const [activating, setActivating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [stationLost, setStationLost] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);

  // Re-associates this (possibly new, post-reconnect) socket with the room on
  // every connect — including the very first one, since a hard page refresh
  // also gets a fresh socket. Without this, a network blip or backgrounded tab
  // silently orphans the room: this host keeps broadcasting into a room the
  // server already deleted, and listeners get "station not found".
  useEffect(() => {
    if (!hostToken) return undefined;

    function reclaim() {
      socket.timeout(8000).emit('room:reclaim', { roomId, hostToken }, (timeoutErr, res) => {
        setStationLost(Boolean(timeoutErr) || !res?.ok);
      });
    }

    if (socket.connected) reclaim();
    socket.on('connect', reclaim);
    return () => socket.off('connect', reclaim);
  }, [roomId, hostToken]);

  useHostBroadcaster(roomId, playerState);

  const shareUrl = `${window.location.origin}/room/${roomId}`;

  // A play command can succeed and then get silently reverted a moment later
  // if Spotify hands "active device" status to something else — most commonly
  // another Spotify session (phone app, desktop app, another browser tab)
  // still open on the same account. The Web Playback SDK doesn't surface that
  // as an error, it just reports paused, so this cross-checks the account's
  // actual playback state shortly after and explains the likely cause instead
  // of leaving the on-air flicker unexplained.
  async function verifyPlaybackHeld() {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const state = await getPlaybackState();
      if (state && state.is_playing === false) {
        setActionError(
          "Playback stopped right after starting. This usually means Spotify is also open and active on another device (phone, desktop app, speaker) — close it there and hit Play again."
        );
      }
    } catch {
      // Best-effort diagnostic only.
    }
  }

  async function handlePlayPlaylist(contextUri, name) {
    if (!deviceId) return;
    unlockAudio();
    setActionError(null);
    setNowPlayingName(name);
    try {
      await play(deviceId, { contextUri, positionMs: 0 });
      verifyPlaybackHeld();
    } catch (err) {
      setActionError(err.message || "Couldn't start that playlist. Try again.");
    }
  }

  async function handlePauseToggle() {
    if (!deviceId) return;
    unlockAudio();
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
        verifyPlaybackHeld();
      }
    } catch (err) {
      setActionError(err.message || "Couldn't update playback. Try again.");
    }
  }

  async function handleSkip() {
    if (!deviceId) return;
    unlockAudio();
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

  // A station can become unrecoverable for reasons the host can't do anything
  // about (the relay restarted and rooms only live in its memory). Rebuilding
  // one here keeps the already-connected Spotify device and the music, so the
  // host only loses the share link — not their whole setup.
  function startFreshStation() {
    setRestarting(true);
    if (!socket.connected) socket.connect();

    socket.timeout(8000).emit('room:create', {}, (timeoutErr, res) => {
      setRestarting(false);
      if (timeoutErr || !res?.roomId || !res?.hostToken) {
        setActionError("Couldn't reach the station server. Check your connection and try again.");
        return;
      }
      sessionStorage.removeItem(`analog_radio_host_${roomId}`);
      sessionStorage.setItem(`analog_radio_host_${res.roomId}`, res.hostToken);
      setStationLost(false);
      navigate(`/room/${res.roomId}`, { state: { isHost: true }, replace: true });
    });
  }

  return (
    <div className="room room--host">
      <h1 className="room__title">Your Station</h1>

      <div className="room__share">
        <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        <button onClick={copyShareLink}>{linkCopied ? 'Copied!' : 'Copy link'}</button>
      </div>

      <PresenceList listenerCount={listenerCount} isHost />

      {stationLost && (
        <div className="room__recover">
          <p className="room__error">
            This station closed while you were disconnected, so the old share link no longer
            works. Your music and Spotify connection are fine — grab a new link to send out.
          </p>
          <button onClick={startFreshStation} disabled={restarting}>
            {restarting ? 'Starting…' : 'Get a new link'}
          </button>
        </div>
      )}

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
