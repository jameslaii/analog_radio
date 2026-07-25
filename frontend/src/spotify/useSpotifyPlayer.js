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

  useEffect(() => {
    return () => {
      playerRef.current?.disconnect();
    };
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
        transferPlayback(device_id)
          .then(() => setIsActive(true))
          .catch(() => setError("Couldn't activate the Spotify device. Try Go Live again."));
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

      const connected = await player.connect();
      if (!connected) throw new Error('Failed to connect Spotify Web Playback SDK.');

      playerRef.current = player;
    } catch (err) {
      setError(err.message);
    } finally {
      activatingRef.current = false;
    }
  }, []);

  const setLocalVolume = useCallback((volume0to1) => {
    playerRef.current?.setVolume(volume0to1);
  }, []);

  return { activate, deviceId, playerState, error, isActive, setLocalVolume };
}

export { useSpotifyPlayer };
