import { useEffect, useRef, useState } from 'react';
import { colourFor } from '../lib/personColour';
import { isChimeMuted, setChimeMuted, playChatChime } from '../lib/chatChime';

/**
 * Talking to the room while it plays.
 *
 * Deliberately sits below the console and doesn't take focus on load: on a
 * phone the keyboard covers roughly half the screen, and a chat box that grabs
 * the cursor would bury the thing everyone came here to watch. It only comes up
 * when someone actually taps into it.
 *
 * Nothing here is kept. The room relays what is said to whoever is in it at the
 * time and stores none of it, so arriving late means arriving to a blank log
 * rather than to everyone else's evening.
 */
function Chat({ messages, onSend, me }) {
  const [draft, setDraft] = useState('');
  const [soundOff, setSoundOff] = useState(isChimeMuted);
  const listRef = useRef(null);
  const pinnedToBottom = useRef(true);

  // Follow the conversation, unless the reader has scrolled up to catch up on
  // something — yanking them back down mid-sentence is worse than a missed line.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !pinnedToBottom.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 40;
  }

  function toggleSound() {
    const next = !soundOff;
    setSoundOff(next);
    setChimeMuted(next);
    // Turning it back on plays it once. That doubles as the demonstration —
    // you find out what it sounds like now, rather than being startled by it
    // mid-song — and as the tap a browser wants before it will let the page
    // make noise at all.
    if (!next) playChatChime();
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    pinnedToBottom.current = true;
  }

  return (
    <div className="chat">
      <div className="chat__header">
        <h4>Room talk</h4>
        <button
          type="button"
          className="chat__sound"
          onClick={toggleSound}
          aria-pressed={!soundOff}
          title={soundOff ? 'Play a sound when someone speaks' : 'Stop sounding for messages'}
        >
          {soundOff ? 'sound off' : 'sound on'}
        </button>
      </div>

      <div className="chat__log" ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <p className="chat__empty">
            Nothing said since you tuned in — anything before that is gone.
          </p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="chat__line">
              <span className="chat__who" style={{ color: colourFor(m.name) }}>
                {m.name === me ? 'you' : m.name}
              </span>
              <span className="chat__text">{m.text}</span>
            </p>
          ))
        )}
      </div>

      <form className="chat__compose" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something…"
          maxLength={300}
          aria-label="Message the room"
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default Chat;
