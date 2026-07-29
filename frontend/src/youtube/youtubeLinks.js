// Pulling the id out of a pasted link means the app needs no API key and no
// Google project to be useful on day one. Search is a nice addition later, but
// it shouldn't be the thing standing between someone and their first song.
function parseVideoId(input) {
  const raw = (input || '').trim();
  if (!raw) return null;

  // A bare id, pasted straight from somewhere.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // /embed/ID, /shorts/ID, /live/ID
    const parts = url.pathname.split('/').filter(Boolean);
    const id = parts[1];
    if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return id;
    }
  }

  return null;
}

/**
 * Pulls a readable playlist id out of a link, if there is one.
 *
 * Most links people share carry both a video and the playlist it was playing
 * from, so finding a list here doesn't mean the video should be ignored — it
 * means there is a whole playlist available if it can be read.
 *
 * Not every `list=` can be. Mixes (`RD…`) are generated per-viewer and the API
 * returns nothing for them, and Watch Later and Liked Videos are private to the
 * account holder. Those are treated as no playlist at all, so the link falls
 * back to queueing the one video rather than failing.
 */
function parsePlaylistId(input) {
  const raw = (input || '').trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const isYouTube =
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com';
  if (!isYouTube) return null;

  const list = url.searchParams.get('list');
  if (!list || !/^[a-zA-Z0-9_-]{2,50}$/.test(list)) return null;
  if (/^(RD|UL|LL|WL)/.test(list)) return null;

  return list;
}

/**
 * Gets a human title for a video without an API key. oEmbed is public and
 * unauthenticated; it gives a title but no duration, so the player supplies
 * that once the track actually starts.
 */
async function fetchTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
  }
}

export { parseVideoId, parsePlaylistId, fetchTitle };
