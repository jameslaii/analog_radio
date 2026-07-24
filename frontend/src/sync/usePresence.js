import { useEffect, useState } from 'react';
import { socket } from './socket';

/** Tracks the live listener count for the current room via room:presence broadcasts. */
function usePresence(initialCount = 0) {
  const [listenerCount, setListenerCount] = useState(initialCount);

  useEffect(() => {
    function onPresence({ listenerCount: count }) {
      setListenerCount(count);
    }
    socket.on('room:presence', onPresence);
    return () => socket.off('room:presence', onPresence);
  }, []);

  return listenerCount;
}

export { usePresence };
