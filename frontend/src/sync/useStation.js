import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import { playChatChime } from '../lib/chatChime';

// The station's position keeps moving while the page sits still, so it is
// re-read on a timer rather than only when the server speaks. Background tabs
// get their timers throttled, which is exactly when a listener drifts furthest
// and most needs correcting on return.
const RESYNC_INTERVAL_MS = 10_000;

// Chat is never fetched, only received, so this is the only thing keeping an
// all-evening session from growing a few thousand lines of DOM nobody has
// scrolled back to since.
const MAX_VISIBLE_MESSAGES = 200;

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
          // Nothing to seed the chat with: the room hands over no history, and
          // messages already on screen are deliberately left alone. This runs
          // again on every reconnect, and dropping a wifi blip for a few
          // seconds shouldn't cost you the conversation you were in.
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
      // Your own line coming back off the relay isn't news, and a sound for it
      // would fire on every keystroke's worth of conversation you started.
      if (message.name !== nameRef.current) playChatChime();
      setMessages((prev) => [...prev, message].slice(-MAX_VISIBLE_MESSAGES));
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

  // A whole playlist in one event. Resolves to how many actually landed, since
  // a playlist can carry more than the station will take at once.
  const addManyToQueue = useCallback(
    (tracks) =>
      new Promise((resolve) => {
        socket.timeout(15000).emit(
          'queue:addMany',
          { roomId, addedBy: nameRef.current, tracks },
          (err, res) => resolve(err || !res?.ok ? 0 : res.added || 0)
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
    addManyToQueue,
    removeFromQueue,
    skip,
    rateTrack,
    reportDuration,
    reportUnplayable,
    reportEnded,
  };
}

export { useStation };
