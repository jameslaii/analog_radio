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

// Seeking is audible, so correcting small drift does more damage than the drift
// itself. This is the gap worth an audible jump to close.
const DRIFT_TOLERANCE_MS = 1500;

/**
 * Holds a YouTube player and keeps it lined up with the station's clock.
 *
 * The container element must already be on the page when this runs — the player
 * replaces a div by id, and given a missing one it attaches to nothing and stays
 * silently blank.
 */
function useYouTubePlayer(containerId, onEnded) {
  const playerRef = useRef(null);
  const currentVideoRef = useRef(null);
  const wantsPlaybackRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      if (!document.getElementById(containerId)) return;

      playerRef.current = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        playerVars: {
          // Without this iOS takes the video fullscreen the moment it starts,
          // throwing the listener out of the room to watch it.
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e) => {
            const YT = window.YT;
            setIsPlaying(e.data === YT?.PlayerState?.PLAYING);
            if (e.data === YT?.PlayerState?.ENDED) {
              onEndedRef.current?.(currentVideoRef.current);
            }
          },
          onError: (e) => {
            // 101 and 150 both mean the owner won't allow playback off YouTube.
            // Nothing to retry; the station has to move past it.
            const embeddingRefused = e.data === 101 || e.data === 150;
            setUnplayable({
              videoId: currentVideoRef.current,
              reason: embeddingRefused
                ? "The owner won't allow this one to play outside YouTube."
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

  const syncTo = useCallback((videoId, positionMs) => {
    const p = playerRef.current;
    if (!p || !p.loadVideoById) return;

    const positionSec = Math.max(positionMs, 0) / 1000;
    wantsPlaybackRef.current = true;

    if (currentVideoRef.current !== videoId) {
      currentVideoRef.current = videoId;
      setUnplayable(null);
      p.loadVideoById({ videoId, startSeconds: positionSec });
      return;
    }

    try {
      const localSec = p.getCurrentTime() || 0;
      if (Math.abs(localSec * 1000 - positionMs) > DRIFT_TOLERANCE_MS) {
        p.seekTo(positionSec, true);
      }
      // Worth asking every time: desktop will simply start, and on iOS this is
      // refused until a tap, which is what the gate in the UI is for.
      if (p.getPlayerState() !== window.YT?.PlayerState?.PLAYING) p.playVideo();
    } catch {
      /* player still warming up */
    }
  }, []);

  const stop = useCallback(() => {
    wantsPlaybackRef.current = false;
    currentVideoRef.current = null;
    try {
      playerRef.current?.stopVideo?.();
    } catch {
      /* ignore */
    }
  }, []);

  /** Runs from a tap — the only thing that persuades iOS to make noise. */
  const startPlayback = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.unMute();
      p.setVolume(80);
      p.playVideo();
    } catch {
      /* ignore */
    }
  }, []);

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

  return {
    ready,
    isPlaying,
    // Something is meant to be playing and isn't. Rather than leave the listener
    // staring at a silent station wondering whose fault it is, the UI shows a
    // gate over the player and this is what tells it to.
    needsTap: ready && wantsPlaybackRef.current && !isPlaying,
    unplayable,
    syncTo,
    stop,
    startPlayback,
    getDurationMs,
    setVolume,
  };
}

export { useYouTubePlayer };
