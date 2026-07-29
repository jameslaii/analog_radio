const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001';

// Reading a playlist needs the API, so a station without a key can't do it.
// Told apart from a failure for the same reason search is: there is nothing to
// retry, and the answer is to paste the track links instead.
const PLAYLIST_UNAVAILABLE = 'playlist_not_configured';

// The playlist exists but isn't ours to read — private, or gone.
const PLAYLIST_NOT_READABLE = 'playlist_not_readable';

// The relay is older than this feature and has no idea what a playlist is.
// Worth its own answer: the frontend deploys on its own, so it will meet
// relays that predate it, and it shouldn't blame the playlist for that.
const PLAYLIST_UNSUPPORTED = 'playlist_unsupported';

async function importPlaylist(listId) {
  const res = await fetch(`${BACKEND_URL}/playlist?list=${encodeURIComponent(listId)}`);

  if (res.status === 501) throw new Error(PLAYLIST_UNAVAILABLE);

  // A relay that has never heard of this route answers with its own 404 page
  // rather than one of ours, so the body is what tells the two apart — both
  // arrive as a 404, and only one of them is about the playlist.
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(PLAYLIST_UNSUPPORTED);

  if (res.status === 404) throw new Error(PLAYLIST_NOT_READABLE);
  if (!res.ok) throw new Error('playlist_failed');

  return data.tracks || [];
}

export { importPlaylist, PLAYLIST_UNAVAILABLE, PLAYLIST_NOT_READABLE, PLAYLIST_UNSUPPORTED };
