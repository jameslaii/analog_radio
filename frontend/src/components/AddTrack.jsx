import { useState } from 'react';
import { searchTracks, SEARCH_UNAVAILABLE } from '../youtube/searchTracks';

/**
 * Adding something to the queue. Searching is the way most people will want to
 * do it, but pasting a link always works and needs nothing configured, so it
 * stays available rather than being replaced.
 */
function AddTrack({ onAddLink, onAddResult }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [searchUnavailable, setSearchUnavailable] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;

    // A pasted link shouldn't be treated as a search term.
    if (/youtu\.?be|^[a-zA-Z0-9_-]{11}$/.test(text)) {
      setSearching(true);
      const ok = await onAddLink(text);
      setSearching(false);
      if (ok) {
        setQuery('');
        setResults([]);
      }
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchTracks(text);
      setResults(found);
      if (found.length === 0) setSearchError('Nothing found for that. Try different words.');
    } catch (err) {
      if (err.message === SEARCH_UNAVAILABLE) {
        setSearchUnavailable(true);
        setSearchError(null);
      } else {
        setSearchError("Search didn't go through. You can paste a YouTube link instead.");
      }
    } finally {
      setSearching(false);
    }
  }

  async function queueResult(result) {
    setAddingId(result.videoId);
    const ok = await onAddResult(result);
    setAddingId(null);
    if (ok) {
      setQuery('');
      setResults([]);
    }
  }

  return (
    <div className="add-track">
      <form className="room__share" onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchUnavailable ? 'Paste a YouTube link…' : 'Search, or paste a link…'}
          aria-label="Search for a track or paste a YouTube link"
        />
        <button type="submit" disabled={searching}>
          {searching ? '…' : searchUnavailable ? 'Queue it' : 'Search'}
        </button>
      </form>

      {searchUnavailable && (
        <p className="add-track__note">
          Search isn't switched on for this station yet, but pasting a YouTube link works.
        </p>
      )}

      {searchError && <p className="room__error">{searchError}</p>}

      {results.length > 0 && (
        <ul className="results">
          {results.map((r) => (
            <li key={r.videoId}>
              <button
                className="results__item"
                onClick={() => queueResult(r)}
                disabled={addingId === r.videoId}
              >
                {r.thumbnail && <img src={r.thumbnail} alt="" className="results__thumb" />}
                <span className="results__body">
                  <span className="results__title">{r.title}</span>
                  <span className="results__channel">{r.channel}</span>
                </span>
                <span className="results__add" aria-hidden="true">
                  {addingId === r.videoId ? '…' : '+'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddTrack;
