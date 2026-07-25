import { getValidAccessToken } from './spotifyAuth';

const API_BASE = 'https://api.spotify.com/v1';

class PremiumRequiredError extends Error {
  constructor() {
    super('Spotify Premium is required for playback control.');
    this.name = 'PremiumRequiredError';
  }
}

// Right after the Web Playback SDK's `ready` event fires, Spotify's backend
// hasn't always finished registering the device yet — player-scoped endpoints
// (play/pause/seek/etc.) can 404 with "Device not found" for a few hundred ms.
// This is a known SDK quirk, not a real failure, so these calls get retried
// briefly instead of surfacing an error to the user.
class DeviceNotFoundError extends Error {
  constructor() {
    super('Spotify device not found.');
    this.name = 'DeviceNotFoundError';
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
  if (res.status === 404) throw new DeviceNotFoundError();
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return null;
}

async function requestWithDeviceRetry(path, options, attempts = 4, delayMs = 400) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await request(path, options);
    } catch (err) {
      if (!(err instanceof DeviceNotFoundError) || attempt === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  return undefined;
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

  return requestWithDeviceRetry(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function pause(deviceId) {
  return requestWithDeviceRetry(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
}

function seek(deviceId, positionMs) {
  return requestWithDeviceRetry(
    `/me/player/seek?position_ms=${Math.round(positionMs)}&device_id=${deviceId}`,
    { method: 'PUT' }
  );
}

function skipNext(deviceId) {
  return requestWithDeviceRetry(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
}

function transferPlayback(deviceId) {
  return requestWithDeviceRetry('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

function setVolume(deviceId, volumePercent) {
  return requestWithDeviceRetry(
    `/me/player/volume?volume_percent=${Math.round(volumePercent)}&device_id=${deviceId}`,
    { method: 'PUT' }
  );
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
