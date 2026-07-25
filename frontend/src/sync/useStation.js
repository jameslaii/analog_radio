import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';

// The station's position keeps moving while the page sits still, so it is
// re-read on a timer rather than only when the server speaks. Background tabs
// get their timers throttled, which is exactly when a listener drifts furthest
// and most needs correcting on return.
const RESYNC_INTERVAL_MS = 10_000;

/**
 * Connects to a station and keeps a live view of what it's playing, what's
 * queued, and who's listening.
 */
function useStation(roomId, listenerName) {
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [joinError, setJoinError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const nameRef = useRef(listenerName);
  nameRef.current = listenerName;

  useEffect(() => {
    if (!roomId || !listenerName) return undefined;

    function join() {
      socket.timeout(8000).emit(
        'station:join',
        { roomId, name: nameRef.current },
        (timeoutErr, res) => {
          if (timeoutErr) {
            setJoinError('unreachable');
            return;
          }
          if (!res?.ok) {
            setJoinError(res?.error || 'unknown');
            return;
          }
          setJoinError(null);
          setState(res.state);
          // The backlog arrives once, on joining; everything after it comes in
          // one message at a time.
          setMessages(res.messages || []);
        }
      );
    }

    function onConnect() {
      setConnected(true);
      // A reconnect hands us a new socket id, so the station no longer counts us
      // as present until we say so again.
      join();
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(next) {
      setState(next);
    }
    function onMessage(message) {
      // Guard against a duplicate slipping in when a reconnect replays the
      // backlog over messages already on screen.
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('station:state', onState);
    socket.on('chat:message', onMessage);

    if (!socket.connected) socket.connect();
    else join();

    const resync = setInterval(() => {
      if (!socket.connected) return;
      socket.timeout(6000).emit('playback:resync', { roomId }, (err, fresh) => {
        if (!err && fresh) setState(fresh);
      });
    }, RESYNC_INTERVAL_MS);

    return () => {
      clearInterval(resync);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('station:state', onState);
      socket.off('chat:message', onMessage);
    };
  }, [roomId, listenerName]);

  const addToQueue = useCallback(
    (track) =>
      new Promise((resolve) => {
        socket.timeout(8000).emit(
          'queue:add',
          { roomId, addedBy: nameRef.current, ...track },
          (err, res) => resolve(!err && res?.ok)
        );
      }),
    [roomId]
  );

  const removeFromQueue = useCallback(
    (itemId) => socket.emit('queue:remove', { roomId, itemId }),
    [roomId]
  );

  const skip = useCallback(() => socket.emit('playback:skip', { roomId }), [roomId]);

  const rateTrack = useCallback(
    (itemId, value) => socket.emit('track:rate', { roomId, itemId, value }),
    [roomId]
  );

  const reportDuration = useCallback(
    (itemId, durationMs) => socket.emit('track:duration', { roomId, itemId, durationMs }),
    [roomId]
  );

  const reportUnplayable = useCallback(
    (itemId) => socket.emit('track:unplayable', { roomId, itemId }),
    [roomId]
  );

  const reportEnded = useCallback(
    (itemId) => socket.emit('track:ended', { roomId, itemId }),
    [roomId]
  );

  const sendMessage = useCallback((text) => socket.emit('chat:send', { roomId, text }), [roomId]);

  return {
    state,
    messages,
    sendMessage,
    joinError,
    connected,
    addToQueue,
    removeFromQueue,
    skip,
    rateTrack,
    reportDuration,
    reportUnplayable,
    reportEnded,
  };
}

export { useStation };
