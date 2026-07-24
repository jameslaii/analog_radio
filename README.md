# analog_radio

Tune your friends into your Spotify, live. One person (the **host**) connects
their Spotify, picks a playlist, and broadcasts it like a radio station.
Friends open a shared link and click a single **Tune In** button (Spotify
login happens as part of that click if needed), and their playback stays in
sync with the host's — track changes, pause, and seeks all follow along in
real time.

No audio is streamed through this app — everyone's music plays through their
*own* Spotify. The app just tells each listener's Spotify what to play and
when, via the Spotify Web API. **Everyone (host and listeners) needs Spotify
Premium**, since Spotify only allows programmatic playback control for
Premium accounts.

## How it works

- **Frontend** (`frontend/`): React + Vite. Handles Spotify login (PKCE,
  entirely client-side — no client secret needed), the Web Playback SDK (an
  in-browser Spotify Connect device), and the retro radio UI.
- **Backend** (`backend/`): a tiny Express + Socket.io relay. It never sees
  Spotify tokens — its only job is broadcasting the host's live playback
  state to everyone in a room, and tracking who's in the room. Room state
  lives in memory and resets if the server restarts.

## One-time setup: create a Spotify Developer app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and log in with your Spotify account.
2. Click **Create app**. Name/description can be anything (e.g. "Analog Radio dev").
3. **Redirect URI**: add exactly `http://127.0.0.1:5173/callback`
   (use `127.0.0.1`, not `localhost` — Spotify requires an exact match, and
   `127.0.0.1` avoids some browser quirks with `localhost`).
4. When asked which APIs you'll use, select **Web API**.
5. Save, then open **Settings** and copy the **Client ID**. You don't need
   the client secret — this app uses PKCE, which doesn't require one.

## Running it locally

**1. Configure environment variables**

```
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Edit `frontend/.env` and paste in your Client ID:

```
VITE_SPOTIFY_CLIENT_ID=<your client id>
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
VITE_BACKEND_URL=http://127.0.0.1:3001
```

`backend/.env` should already be fine as-is for local use.

**2. Install and run both servers** (in two terminals)

```
cd backend && npm install && npm run dev     # Socket.io relay on :3001
cd frontend && npm install && npm run dev    # Vite dev server on :5173
```

**3. Try it**

Open `http://127.0.0.1:5173` in your browser, connect Spotify, and click
**Start Broadcasting**. Copy the room link it gives you and open it in a
*second* browser (or a private/incognito window, or a different browser
entirely) logged into a **different Spotify Premium account** — that's your
"listener." Click **Tune In**, and its playback should follow whatever the
host plays.

## Deploying (so the link works for real, off your machine)

This is a two-part deploy: the **frontend** goes to Vercel; the **backend**
needs a host that supports a long-running Node process (Vercel's serverless
functions aren't a good fit for a stateful Socket.io relay with in-memory
room state and persistent connections).

**1. Backend** — deploy `backend/` to something like
[Railway](https://railway.app), [Render](https://render.com), or
[Fly.io](https://fly.io) (all have a free tier for a small always-on Node
service). Set its env vars:
```
PORT=<whatever the host assigns, usually automatic>
CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
```
Note the backend's public URL once deployed.

**2. Frontend** — import this repo into [Vercel](https://vercel.com/new),
set the **root directory** to `frontend/`, and add these Environment
Variables in the Vercel project settings:
```
VITE_SPOTIFY_CLIENT_ID=<your client id>
VITE_SPOTIFY_REDIRECT_URI=https://<your-vercel-domain>.vercel.app/callback
VITE_BACKEND_URL=<your backend's public URL from step 1>
```
Vercel auto-detects the Vite build (`npm run build`, output `dist/`); a
`frontend/vercel.json` is already included so client-side routes like
`/room/:id` and `/callback` don't 404 on refresh/direct load.

**3. Spotify Dashboard** — add
`https://<your-vercel-domain>.vercel.app/callback` as an additional Redirect
URI (keep the `127.0.0.1` one too, for local dev).

Once all three are set, the share link works for anyone, anywhere.

## Known limitations (this is a local prototype)

- **Running locally, the link only works on `127.0.0.1`** (i.e., the same
  machine) — Spotify locks OAuth redirect URIs to an exact origin. See
  "Deploying" above for the real fix. As a quicker local-only workaround to
  test with a friend on the same Wi-Fi or remotely, run a tunnel:

  ```
  ngrok http 5173
  ```

  then add the ngrok URL + `/callback` as an *additional* Redirect URI in
  your Spotify app settings, and set `VITE_SPOTIFY_REDIRECT_URI` /
  `VITE_BACKEND_URL` to match. Free ngrok URLs change every restart, so
  you'll need to re-add it each session (or use a paid static domain).
- **If the host's connection drops or they refresh the page, the room
  closes** and a new share link is needed — the backend has no persistence.
- Every participant needs **Spotify Premium**; free accounts will get a
  clear "Premium required" message instead of audio.
