# analog_radio

A shared radio station for a group of friends. One person starts a station,
everyone else opens the link, and you all hear the same thing at the same
moment. Anyone can queue a track, anyone can skip, and everyone can rate what's
playing while it plays.

**No accounts. No sign-in. No subscriptions.** Open the link, pick a name, and
you're in.

## How it works

- **Frontend** (`frontend/`): React + Vite. Plays audio through YouTube's IFrame
  player and keeps itself lined up with the station's clock.
- **Backend** (`backend/`): Express + Socket.io. Owns the queue, what's playing,
  how far into it, and who's listening.

The important detail is that the **server holds the clock**, not any one
person's browser. Nobody is the host, so nobody closing a tab ends the night —
the queue keeps playing and late arrivals drop into the middle of whatever is
on, rather than restarting it for everyone.

Tracks are added by pasting a YouTube link. That needs no API key, so there is
nothing to set up before the first song.

## Running it locally

```
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

The defaults are fine for local use. Then, in two terminals:

```
cd backend && npm install && npm run dev     # relay on :3001
cd frontend && npm install && npm run dev    # app on :5173
```

Open `http://127.0.0.1:5173`, hit **Start a Station**, and paste a YouTube link.
To test it as a group, open the station link in a second browser or a private
window — you should see both listeners and hear the same track in step.

## Tests

```
cd backend && npm test
```

Starts its own relay and drives it over a real socket: queueing, ratings,
advancing to the next track, presence, and whether a station survives everyone
leaving.

## Deploying

Two parts: the frontend goes to Vercel, and the backend needs a host that keeps
a Node process alive (a stateful Socket.io relay isn't a fit for serverless
functions).

**1. Backend** — deploy `backend/` to Railway, Render, or Fly.io, and set:
```
CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
```
Note the public URL it gives you.

**2. Frontend** — import the repo into Vercel with root directory `frontend/`,
and set:
```
VITE_BACKEND_URL=<the backend URL from step 1>
```
A `frontend/vercel.json` is included so `/room/:id` doesn't 404 on refresh.

## Known limitations

- **Some videos refuse to play outside YouTube.** Labels block embedding on a
  lot of official music videos. The station detects this and skips, but the
  track is simply unavailable — there's no way around it.
- **Phones stop playing when the browser is backgrounded.** You can't lock your
  phone and keep listening the way a native music app allows.
- **Ads can pull people out of sync**, since they don't run the same length for
  everyone.
- **Rooms live in memory.** A backend restart clears every station. Idle
  stations are reclaimed after two hours.
