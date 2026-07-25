import { useEffect, useRef, useState } from 'react';
import { colourFor } from '../lib/personColour';

/**
 * Talking to the room while it plays.
 *
 * Deliberately sits below the console and doesn't take focus on load: on a
 * phone the keyboard covers roughly half the screen, and a chat box that grabs
 * the cursor would bury the thing everyone came here to watch. It only comes up
 * when someone actually taps into it.
 */
function Chat({ messages, onSend, me }) {
  const [draft, setDraft] = useState('');
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
      </div>

      <div className="chat__log" ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <p className="chat__empty">Nothing said yet.</p>
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
