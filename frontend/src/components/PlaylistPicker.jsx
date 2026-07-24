import { useEffect, useState } from 'react';
import { getMyPlaylists, search } from '../spotify/spotifyApi';

/** Host-only control for picking a playlist to broadcast. Calls onPlay(contextUri) when chosen. */
function PlaylistPicker({ onPlay }) {
  const [playlists, setPlaylists] = useState([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    getMyPlaylists()
      .then((data) => setPlaylists(data?.items ?? []))
      .catch(() => setPlaylistsError("Couldn't load your playlists. Try refreshing the page."))
      .finally(() => setPlaylistsLoading(false));
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearchError(null);
    try {
      const data = await search(query, ['playlist']);
      setResults(data?.playlists?.items?.filter(Boolean) ?? []);
    } catch {
      setSearchError("Search didn't go through. Try again.");
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
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {searchError && <p className="playlist-picker__error">{searchError}</p>}

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
        {playlistsLoading && <p className="playlist-picker__hint">Loading your playlists…</p>}
        {playlistsError && <p className="playlist-picker__error">{playlistsError}</p>}
        {!playlistsLoading && !playlistsError && playlists.length === 0 && (
          <p className="playlist-picker__hint">No playlists found on your Spotify account.</p>
        )}
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
