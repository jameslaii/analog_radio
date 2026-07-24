import { useEffect, useState } from 'react';
import { getMyPlaylists, search } from '../spotify/spotifyApi';

/** Host-only control for picking a playlist to broadcast. Calls onPlay(contextUri) when chosen. */
function PlaylistPicker({ onPlay }) {
  const [playlists, setPlaylists] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMyPlaylists()
      .then((data) => setPlaylists(data?.items ?? []))
      .catch(() => setPlaylists([]));
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await search(query, ['playlist']);
      setResults(data?.playlists?.items?.filter(Boolean) ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="playlist-picker">
      <form onSubmit={handleSearch} className="playlist-picker__search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search playlists..."
        />
        <button type="submit" disabled={loading}>Search</button>
      </form>

      {results.length > 0 && (
        <div className="playlist-picker__section">
          <h4>Search results</h4>
          <ul>
            {results.map((p) => (
              <li key={p.id}>
                <button onClick={() => onPlay(p.uri, p.name)}>{p.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="playlist-picker__section">
        <h4>Your playlists</h4>
        <ul>
          {playlists.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPlay(p.uri, p.name)}>{p.name}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PlaylistPicker;
