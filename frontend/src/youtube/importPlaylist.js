const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001';

// Reading a playlist needs the API, so a station without a key can't do it.
// Told apart from a failure for the same reason search is: there is nothing to
// retry, and the answer is to paste the track links instead.
const PLAYLIST_UNAVAILABLE = 'playlist_not_configured';

// The playlist exists but isn't ours to read — private, or gone.
const PLAYLIST_NOT_READABLE = 'playlist_not_readable';

async function importPlaylist(listId) {
  const res = await fetch(`${BACKEND_URL}/playlist?list=${encodeURIComponent(listId)}`);

  if (res.status === 501) throw new Error(PLAYLIST_UNAVAILABLE);
  if (res.status === 404) throw new Error(PLAYLIST_NOT_READABLE);
  if (!res.ok) throw new Error('playlist_failed');

  const data = await res.json();
  return data.tracks || [];
}

export { importPlaylist, PLAYLIST_UNAVAILABLE, PLAYLIST_NOT_READABLE };
