const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001';

// Distinguished from a genuine failure because it isn't one: the station simply
// has no API key set, and the answer is to paste a link rather than retry.
const SEARCH_UNAVAILABLE = 'search_not_configured';

async function searchTracks(query) {
  const res = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}`);

  if (res.status === 501) throw new Error(SEARCH_UNAVAILABLE);
  if (!res.ok) throw new Error('search_failed');

  const data = await res.json();
  return data.results || [];
}

export { searchTracks, SEARCH_UNAVAILABLE };
