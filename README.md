# analog_radio

A shared radio station for a group of friends. One person starts a station,
everyone else opens the link, and you all hear the same thing at the same
moment. Anyone can queue a track, anyone can skip, and everyone can rate what's
playing while it plays.

Paste a link with a playlist on it and the whole playlist comes. Going round
the room a track at a time means that doesn't cost anyone else their turn.

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

## Whose turn it is

The queue plays a turn at a time from each person with something waiting, so
pasting a fifty-track playlist doesn't buy you the next three hours. Your first
track plays before anyone's second, however much they queued; within your own
tracks, your order is left alone.

## Going off the air

**Off the air** stops the music for you and nobody else. The station has no
host, so there is no one whose pause should silence the room — it keeps
playing, and coming back on drops you in live, wherever it has got to by then.
Skip is still the way to end a track for everybody.

## Room talk

The chat is live only. Nothing is stored — not on the server, not anywhere —
so whoever opens the link an hour into the night arrives to an empty log
rather than to everyone else's evening. You see what is said while you are in
the room, and that is all.

A message from someone else plays a short, quiet blip, because on a phone the
chat is usually scrolled off under the player and a line landing there is
otherwise silent and invisible. Your own messages never sound. There's a
**sound on / sound off** switch in the chat header if you'd rather it didn't,
and it's remembered on that device.

## Playlists

Pasting a link with `list=` on it queues the whole playlist rather than the one
video. This is the one thing that needs `YOUTUBE_API_KEY` set on the backend —
a playlist's contents can't be read without it. Without a key the same link
still queues the video it names.

Mixes (`RD…`), Watch Later, and Liked Videos can't be read by anyone but their
owner, so those links queue the single video too.

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
  phone and keep listening the way a native music app allows. Since the station
  keeps running without you, coming back puts you wherever it has reached
  rather than where you left.
- **Ads can pull people out of sync**, since they don't run the same length for
  everyone.
- **Rooms live in memory.** A backend restart clears every station. Idle
  stations are reclaimed after two hours.
- **Refreshing the page clears your chat.** It's held in the tab and nowhere
  else, so there is nothing to restore it from. That's the same property that
  makes the room's talk disappear in the first place.
