import { useEffect, useRef, useState } from 'react';
import { useStation } from '../sync/useStation';
import { useYouTubePlayer } from '../youtube/useYouTubePlayer';
import { parseVideoId, fetchTitle } from '../youtube/youtubeLinks';
import Queue from '../components/Queue';
import RatingBar from '../components/RatingBar';
import TuningDial from '../components/TuningDial';
import VolumeKnob from '../components/VolumeKnob';
import FrequencyDisplay from '../components/FrequencyDisplay';
import OnAirIndicator from '../components/OnAirIndicator';

const PLAYER_ID = 'analog-radio-player';
const NAME_KEY = 'analog_radio_name';

/** Everyone gets the same screen — there is no host to be, only people in a room. */
function Station({ roomId }) {
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) || '');
  const [nameDraft, setNameDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const {
    state,
    joinError,
    connected,
    addToQueue,
    removeFromQueue,
    skip,
    rateTrack,
    reportDuration,
    reportUnplayable,
    reportEnded,
  } = useStation(roomId, name);

  // The station is identified by the item that was playing when the video
  // finished, read at that moment rather than captured earlier, so a stale
  // closure can't end the wrong track.
  const nowPlayingRef = useRef(null);
  const { ready, blocked, unplayable, syncTo, stop, unmuteAndPlay, setVolume, getDurationMs } =
    useYouTubePlayer(PLAYER_ID, () => {
      const current = nowPlayingRef.current;
      if (current) reportEnded(current.id);
    });

  const nowPlaying = state?.nowPlaying ?? null;
  nowPlayingRef.current = nowPlaying;
  const reportedDurationFor = useRef(null);
  const reportedUnplayableFor = useRef(null);

  // Follow the station: load what it's playing, land where it has got to.
  useEffect(() => {
    if (!ready) return;
    if (!nowPlaying) {
      stop();
      return;
    }
    syncTo(nowPlaying.videoId, nowPlaying.positionMs);
  }, [ready, nowPlaying, syncTo, stop]);

  // Tell the station how long the current track runs, once, so it knows when to
  // move on. Only the first listener to manage it needs to.
  useEffect(() => {
    if (!ready || !nowPlaying || nowPlaying.durationMs > 0) return undefined;
    if (reportedDurationFor.current === nowPlaying.id) return undefined;

    const timer = setInterval(() => {
      const durationMs = getDurationMs();
      if (durationMs > 0) {
        reportedDurationFor.current = nowPlaying.id;
        reportDuration(nowPlaying.id, durationMs);
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [ready, nowPlaying, reportDuration, getDurationMs]);

  useEffect(() => {
    if (!unplayable || !nowPlaying) return;
    if (reportedUnplayableFor.current === nowPlaying.id) return;
    reportedUnplayableFor.current = nowPlaying.id;
    reportUnplayable(nowPlaying.id);
  }, [unplayable, nowPlaying, reportUnplayable]);

  async function handleAdd(e) {
    e.preventDefault();
    const videoId = parseVideoId(linkDraft);
    if (!videoId) {
      setAddError("That doesn't look like a YouTube link. Paste the address from the video.");
      return;
    }

    setAdding(true);
    setAddError(null);
    const title = (await fetchTitle(videoId)) || 'Untitled track';
    const ok = await addToQueue({ videoId, title, durationMs: 0 });
    setAdding(false);

    if (!ok) {
      setAddError("Couldn't reach the station. Check your connection and try again.");
      return;
    }
    setLinkDraft('');
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (!name) {
    return (
      <div className="room room--listener">
        <h1 className="room__title">Tune in</h1>
        <p className="landing__hint">What should everyone call you?</p>
        <form
          className="room__share"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = nameDraft.trim();
            if (!trimmed) return;
            sessionStorage.setItem(NAME_KEY, trimmed);
            setName(trimmed);
          }}
        >
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            aria-label="Your name"
          />
          <button type="submit">Tune In</button>
        </form>
      </div>
    );
  }

  if (joinError === 'station_not_found') {
    return (
      <div className="room room--listener">
        <h1 className="room__title">No station here</h1>
        <p className="room__error">
          This station has closed. Ask whoever shared it for a new link, or start your own.
        </p>
        <a className="room__activate" href="/">
          Start a station
        </a>
      </div>
    );
  }

  return (
    <div className="room room--station">
      <h1 className="room__title">Analog Radio</h1>

      <div className="room__share">
        <input readOnly value={window.location.href} onFocus={(e) => e.target.select()} />
        <button onClick={copyShareLink}>{linkCopied ? 'Copied!' : 'Copy link'}</button>
      </div>

      <div className="presence-list">
        <span className="presence-list__count">{state?.listeners?.length ?? 0}</span>
        <span className="presence-list__label">
          {(state?.listeners ?? []).join(', ') || 'just you so far'}
        </span>
      </div>

      {!connected && <p className="room__error">Reconnecting to the station…</p>}

      <div className="radio-console">
        <OnAirIndicator isLive={Boolean(nowPlaying)} />

        <div className={`player-frame ${nowPlaying ? '' : 'player-frame--idle'}`}>
          <div id={PLAYER_ID} />
        </div>

        <TuningDial
          positionMs={nowPlaying?.positionMs}
          durationMs={nowPlaying?.durationMs}
          isPaused={!nowPlaying}
        />

        <FrequencyDisplay
          trackName={nowPlaying?.title ?? 'Dead air — queue something'}
          artistName={nowPlaying ? `added by ${nowPlaying.addedBy}` : null}
        />

        {blocked && (
          <button className="room__activate" onClick={unmuteAndPlay}>
            Tap to start the sound
          </button>
        )}

        {unplayable && <p className="room__error">{unplayable.reason} Skipping…</p>}

        {nowPlaying && (
          <RatingBar ratings={nowPlaying.ratings} onRate={(v) => rateTrack(nowPlaying.id, v)} />
        )}

        <VolumeKnob onChange={(v) => setVolume(Math.round(v * 100))} />

        <div className="room__controls">
          <button onClick={skip} disabled={!nowPlaying}>
            Skip
          </button>
        </div>

        <form className="room__share" onSubmit={handleAdd}>
          <input
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            placeholder="Paste a YouTube link…"
            aria-label="YouTube link"
          />
          <button type="submit" disabled={adding}>
            {adding ? 'Adding…' : 'Queue it'}
          </button>
        </form>

        {addError && <p className="room__error">{addError}</p>}

        <div className="station__section">
          <h4>Up next</h4>
          <Queue items={state?.queue ?? []} onRemove={removeFromQueue} />
        </div>

        {(state?.history?.length ?? 0) > 0 && (
          <div className="station__section">
            <h4>Already played</h4>
            <ul className="history">
              {state.history.map((item) => (
                <li key={item.id} className="history__item">
                  <span className="history__title">{item.title}</span>
                  <span className="history__score">
                    ▲ {item.ratings.up} ▼ {item.ratings.down}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default Station;
