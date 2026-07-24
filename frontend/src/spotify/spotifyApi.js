import { getValidAccessToken } from './spotifyAuth';

const API_BASE = 'https://api.spotify.com/v1';

class PremiumRequiredError extends Error {
  constructor() {
    super('Spotify Premium is required for playback control.');
    this.name = 'PremiumRequiredError';
  }
}

async function request(path, options = {}) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not logged in to Spotify.');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (res.status === 403) throw new PremiumRequiredError();
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return null;
}

function getMe() {
  return request('/me');
}

function search(query, types = ['track', 'playlist'], limit = 10) {
  const params = new URLSearchParams({ q: query, type: types.join(','), limit });
  return request(`/search?${params.toString()}`);
}

function getMyPlaylists(limit = 50) {
  return request(`/me/playlists?limit=${limit}`);
}

function getPlaybackState() {
  return request('/me/player');
}

function play(deviceId, { contextUri, uris, positionMs = 0, offsetTrackUri } = {}) {
  const body = {};
  if (contextUri) {
    body.context_uri = contextUri;
    if (offsetTrackUri) body.offset = { uri: offsetTrackUri };
  }
  if (uris) body.uris = uris;
  if (positionMs) body.position_ms = positionMs;

  return request(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function pause(deviceId) {
  return request(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
}

function seek(deviceId, positionMs) {
  return request(`/me/player/seek?position_ms=${Math.round(positionMs)}&device_id=${deviceId}`, {
    method: 'PUT',
  });
}

function skipNext(deviceId) {
  return request(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
}

function transferPlayback(deviceId) {
  return request('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

function setVolume(deviceId, volumePercent) {
  return request(`/me/player/volume?volume_percent=${Math.round(volumePercent)}&device_id=${deviceId}`, {
    method: 'PUT',
  });
}

export {
  PremiumRequiredError,
  getMe,
  search,
  getMyPlaylists,
  getPlaybackState,
  play,
  pause,
  seek,
  skipNext,
  transferPlayback,
  setVolume,
};
