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

// The YouTube player exposes no fine playback-rate control, so the only way to
// close a gap is to seek — and a seek is audible. That sets up the trade-off:
// too tight and the track stutters as it chases a number, too loose and people
// hear an echo between phones. Past roughly 50ms two devices in earshot sound
// wrong, so this sits close to that and accepts an occasional jump.
const DRIFT_TOLERANCE_MS = 250;

// Seeking isn't instant. Aiming at where the station will be by the time the
// seek lands avoids arriving permanently a beat behind.
const SEEK_COMPENSATION_MS = 120;

// A player that has just been told to seek reports nonsense for a moment, and
// correcting on top of that starts a loop of corrections.
const MIN_CORRECTION_GAP_MS = 2500;

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

  const lastCorrectionRef = useRef(0);

  /**
   * Puts this player where the station says it should be. Safe to call often —
   * it only acts when the gap is worth the interruption of a seek.
   */
  const syncTo = useCallback((videoId, targetMs) => {
    const p = playerRef.current;
    if (!p || !p.loadVideoById) return;

    wantsPlaybackRef.current = true;

    if (currentVideoRef.current !== videoId) {
      currentVideoRef.current = videoId;
      setUnplayable(null);
      lastCorrectionRef.current = Date.now();
      p.loadVideoById({
        videoId,
        startSeconds: Math.max(targetMs + SEEK_COMPENSATION_MS, 0) / 1000,
      });
      return;
    }

    try {
      if (p.getPlayerState() !== window.YT?.PlayerState?.PLAYING) {
        // Not playing yet: on desktop this simply starts it, and on iOS it is
        // refused until a tap, which is what the gate in the UI exists for.
        p.playVideo();
        return;
      }

      const now = Date.now();
      if (now - lastCorrectionRef.current < MIN_CORRECTION_GAP_MS) return;

      const localMs = (p.getCurrentTime() || 0) * 1000;
      if (Math.abs(localMs - targetMs) > DRIFT_TOLERANCE_MS) {
        lastCorrectionRef.current = now;
        p.seekTo(Math.max(targetMs + SEEK_COMPENSATION_MS, 0) / 1000, true);
      }
    } catch {
      /* player still warming up */
    }
  }, []);

  /** How far this player is from where it should be, for showing the listener. */
  const driftFrom = useCallback((targetMs) => {
    try {
      const p = playerRef.current;
      if (!p || p.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) return null;
      return Math.round((p.getCurrentTime() || 0) * 1000 - targetMs);
    } catch {
      return null;
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
    driftFrom,
    stop,
    startPlayback,
    getDurationMs,
    setVolume,
  };
}

export { useYouTubePlayer };
