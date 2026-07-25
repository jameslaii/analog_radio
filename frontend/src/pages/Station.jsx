import { useState } from 'react';
import StationRoom from './StationRoom';

const NAME_KEY = 'analog_radio_name';

/**
 * Asks who you are, then hands over to the room.
 *
 * The split matters: the YouTube player attaches itself to a div by id, and it
 * can only do that if the div is on the page when the player is built. While
 * this screen was part of the same component, the player was being constructed
 * during the name prompt — before its container existed — so it silently
 * attached to nothing and no video ever loaded.
 */
function Station({ roomId }) {
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) || '');
  const [nameDraft, setNameDraft] = useState('');

  if (!name) {
    return (
      <div className="room room--listener">
        <h1 className="room__title">Tune in</h1>
        <p className="landing__hint">What should everyone call you?</p>
        <form
          className="room__share"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = nameDraft.trim();
            if (!trimmed) return;
            sessionStorage.setItem(NAME_KEY, trimmed);
            setName(trimmed);
          }}
        >
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            aria-label="Your name"
          />
          <button type="submit">Tune In</button>
        </form>
      </div>
    );
  }

  return <StationRoom roomId={roomId} name={name} />;
}

export default Station;
