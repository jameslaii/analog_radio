import { useCallback, useEffect, useRef, useState } from 'react';
import { getValidAccessToken } from './spotifyAuth';
import { transferPlayback } from './spotifyApi';

let sdkLoadPromise = null;

function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * Manages an in-browser Spotify Connect device via the Web Playback SDK.
 * Call `activate()` from a user-gesture handler (e.g. a button click) —
 * the SDK requires this before it will play audio.
 */
function useSpotifyPlayer() {
  const [deviceId, setDeviceId] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const playerRef = useRef(null);
  const activatingRef = useRef(false);

  // Fetching the SDK is what makes activate() asynchronous, and on iOS every
  // await spends the user's tap: Safari grants activation only for the moment
  // right after a touch, so anything that resumes later is treated as if no one
  // asked. Loading it up front means the tap handler reaches activateElement()
  // without waiting on the network, which is the whole reason it works there.
  useEffect(() => {
    loadSpotifySdk().catch(() => {
      setError("Couldn't load Spotify's player. Check your connection and reload.");
    });
    return () => {
      playerRef.current?.disconnect();
    };
  }, []);

  // Safe to call on every tap that leads to playback: iOS can drop the audio
  // element's permission between interactions, so re-asserting it costs one
  // synchronous call and saves a silent station. Must be invoked before any
  // await in the handler, or the activation is already spent.
  const unlockAudio = useCallback(() => {
    try {
      const result = playerRef.current?.activateElement?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Browsers that don't gate autoplay reject this; playback is fine without it.
    }
  }, []);

  const activate = useCallback(async () => {
    // Guards against a double-click (or any re-entrant call) creating a second
    // Spotify.Player before the first has finished connecting — that would leak
    // a duplicate Spotify Connect device and duplicate event listeners.
    if (activatingRef.current || playerRef.current) return;
    activatingRef.current = true;
    setError(null);
    try {
      await loadSpotifySdk();

      const player = new window.Spotify.Player({
        name: 'Analog Radio',
        // Access tokens last an hour, so the SDK calls this again mid-session to
        // renew. If that renewal fails the SDK gets no token and simply stops
        // playing — no error event, no visible cause. Catching it here is the
        // only place that silence can be turned into something the user can act
        // on, so a long session doesn't just die quietly.
        getOAuthToken: (callback) => {
          getValidAccessToken()
            .then((token) => {
              if (!token) {
                setError('Your Spotify session expired. Reload the page to reconnect.');
                return;
              }
              callback(token);
            })
            .catch(() => {
              setError('Your Spotify session expired. Reload the page to reconnect.');
            });
        },
        volume: 0.8,
      });

      player.addListener('initialization_error', ({ message }) => setError(message));
      player.addListener('authentication_error', ({ message }) => setError(message));
      player.addListener('account_error', () =>
        setError('Spotify Premium is required to use Analog Radio.')
      );
      player.addListener('playback_error', ({ message }) => setError(message));

      player.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        // transferPlayback retries internally on "device not found" — Spotify's
        // backend needs a moment after `ready` before the device is usable.
        // isActive (and the playback controls it reveals) waits for that to
        // actually succeed, instead of racing the user's first Play click.
        // Whatever Spotify said here is the only clue anyone gets — an account
        // that isn't allowlisted, one without Premium, and a device that never
        // registered all fail at this exact line. Replacing that with one
        // generic sentence sent people chasing a device problem they didn't
        // have, so the real reason is passed through untouched.
        transferPlayback(device_id)
          .then(() => setIsActive(true))
          .catch((err) =>
            setError(err?.message || "Spotify wouldn't start playback on this device.")
          );
      });

      player.addListener('not_ready', () => {
        setIsActive(false);
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        setPlayerState({
          trackUri: state.track_window.current_track.uri,
          trackName: state.track_window.current_track.name,
          artistName: state.track_window.current_track.artists.map((a) => a.name).join(', '),
          positionMs: state.position,
          durationMs: state.duration,
          isPaused: state.paused,
          contextUri: state.context?.uri ?? null,
        });
      });

      playerRef.current = player;

      // Unlock the audio element before connecting, while the tap that started
      // all this is still the browser's most recent interaction. Playback is
      // later started by Web API calls, which carry no user gesture of their
      // own — without this the station goes ON AIR, Spotify reports the track
      // as playing, and iOS emits nothing at all.
      unlockAudio();

      const connected = await player.connect();
      if (!connected) throw new Error('Failed to connect Spotify Web Playback SDK.');
    } catch (err) {
      setError(err.message);
    } finally {
      activatingRef.current = false;
    }
  }, [unlockAudio]);

  const setLocalVolume = useCallback((volume0to1) => {
    playerRef.current?.setVolume(volume0to1);
  }, []);

  return { activate, unlockAudio, deviceId, playerState, error, isActive, setLocalVolume };
}

export { useSpotifyPlayer };
