import { useCallback, useEffect, useRef, useState } from 'react';

let apiLoadPromise = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  });

  return apiLoadPromise;
}

// How far out of step with the station we tolerate before correcting. Seeking is
// audible, so a threshold that's too tight makes the player stutter its way
// through a song chasing a number nobody can hear.
const DRIFT_TOLERANCE_MS = 1500;

/**
 * Holds a YouTube player and keeps it pinned to the station's clock.
 *
 * Unlike the Spotify version this replaced, the audio is playing right here in
 * the page — so staying in sync is a local seek rather than a request to a
 * third party, and there's nothing to log into.
 */
function useYouTubePlayer(containerId, onEnded) {
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [unplayable, setUnplayable] = useState(null);
  const currentVideoRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      playerRef.current = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
          // The player knowing it has finished beats the server counting down to
          // a duration it was told second-hand. Some videos never report one, and
          // a station that waits for a number it will never receive stops dead
          // on a track that has already ended.
          onStateChange: (e) => {
            if (e.data === window.YT?.PlayerState?.ENDED) {
              onEndedRef.current?.(currentVideoRef.current);
            }
          },
          onError: (e) => {
            // 101/150 are "the owner won't allow this off YouTube". Nothing to
            // retry — the station has to move on or it stalls on a dead track.
            const embeddingRefused = e.data === 101 || e.data === 150;
            setUnplayable({
              videoId: currentVideoRef.current,
              reason: embeddingRefused
                ? "This one can't be played outside YouTube."
                : "This video couldn't be loaded.",
            });
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [containerId]);

  /** Aligns the player with the station: right video, right place, playing. */
  const syncTo = useCallback((videoId, positionMs) => {
    const player = playerRef.current;
    if (!player || !player.loadVideoById) return;

    const positionSec = Math.max(positionMs, 0) / 1000;

    if (currentVideoRef.current !== videoId) {
      currentVideoRef.current = videoId;
      setUnplayable(null);
      player.loadVideoById({ videoId, startSeconds: positionSec });
      return;
    }

    let localSec = 0;
    try {
      localSec = player.getCurrentTime() || 0;
    } catch {
      return;
    }

    if (Math.abs(localSec * 1000 - positionMs) > DRIFT_TOLERANCE_MS) {
      player.seekTo(positionSec, true);
    }

    // Browsers refuse audio that no one asked for, and the refusal is silent:
    // the player simply sits paused while the station plays on without it. The
    // listener is told rather than left wondering why it's quiet.
    try {
      const state = player.getPlayerState();
      if (state === window.YT?.PlayerState?.PAUSED || state === window.YT?.PlayerState?.CUED) {
        player.playVideo();
        setBlocked(true);
      } else if (state === window.YT?.PlayerState?.PLAYING) {
        setBlocked(false);
      }
    } catch {
      /* player not ready yet */
    }
  }, []);

  const stop = useCallback(() => {
    currentVideoRef.current = null;
    playerRef.current?.stopVideo?.();
  }, []);

  /** Called from a tap, which is the only thing that convinces a browser to make noise. */
  const unmuteAndPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.unMute();
      player.playVideo();
      setBlocked(false);
    } catch {
      /* nothing sensible to do if the player isn't up yet */
    }
  }, []);

  /** Length of the loaded video in ms, or 0 until the player knows it. */
  const getDurationMs = useCallback(() => {
    try {
      return Math.round((playerRef.current?.getDuration?.() || 0) * 1000);
    } catch {
      return 0;
    }
  }, []);

  const setVolume = useCallback((volume0to100) => {
    try {
      playerRef.current?.setVolume(volume0to100);
    } catch {
      /* ignore */
    }
  }, []);

  return { ready, blocked, unplayable, syncTo, stop, unmuteAndPlay, setVolume, getDurationMs };
}

export { useYouTubePlayer };
