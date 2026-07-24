const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const STORAGE_KEY = 'analog_radio_spotify_tokens';
const VERIFIER_KEY = 'analog_radio_pkce_verifier';
const STATE_KEY = 'analog_radio_pkce_state';
const NEXT_KEY = 'analog_radio_pkce_next';

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(bytes);
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function readTokens() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

function isLoggedIn() {
  return Boolean(readTokens());
}

/** Kicks off the PKCE login redirect. `next` is the app path to return to after auth. */
async function login(next = '/') {
  const verifier = randomString(64);
  const challenge = await sha256(verifier);
  const state = randomString(16);

  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);
  localStorage.setItem(NEXT_KEY, next);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  });

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Call from the /callback route. Exchanges the auth code for tokens and returns the `next` path. */
async function handleCallback(search) {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  const expectedState = localStorage.getItem(STATE_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  const next = localStorage.getItem(NEXT_KEY) || '/';

  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(NEXT_KEY);

  if (error) throw new Error(`Spotify auth error: ${error}`);
  if (!code || !state || state !== expectedState) {
    throw new Error('Invalid or missing auth callback parameters (state mismatch).');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error('Failed to exchange Spotify auth code for tokens.');

  const data = await res.json();
  writeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return next;
}

async function refreshAccessToken() {
  const tokens = readTokens();
  if (!tokens?.refreshToken) throw new Error('No refresh token available.');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: CLIENT_ID,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    clearTokens();
    throw new Error('Failed to refresh Spotify token.');
  }

  const data = await res.json();
  writeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}

/** Returns a valid access token, refreshing it first if it's expired (or near-expired). */
async function getValidAccessToken() {
  const tokens = readTokens();
  if (!tokens) return null;

  const isNearExpiry = Date.now() > tokens.expiresAt - 60_000;
  if (isNearExpiry) {
    await refreshAccessToken();
  }
  return readTokens()?.accessToken ?? null;
}

function logout() {
  clearTokens();
}

export { login, handleCallback, getValidAccessToken, isLoggedIn, logout };
