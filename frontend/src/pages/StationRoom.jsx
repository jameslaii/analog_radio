import { useEffect, useRef, useState } from 'react';
import { useStation } from '../sync/useStation';
import { useServerClock } from '../sync/useServerClock';
import { useYouTubePlayer } from '../youtube/useYouTubePlayer';
import { parseVideoId, fetchTitle } from '../youtube/youtubeLinks';
import AddTrack from '../components/AddTrack';
import Listeners from '../components/Listeners';
import Chat from '../components/Chat';
import Queue from '../components/Queue';
import RatingBar from '../components/RatingBar';
import TuningDial from '../components/TuningDial';
import VolumeKnob from '../components/VolumeKnob';
import FrequencyDisplay from '../components/FrequencyDisplay';
import OnAirIndicator from '../components/OnAirIndicator';

const PLAYER_ID = 'analog-radio-player';

function StationRoom({ roomId, name }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [addError, setAddError] = useState(null);

  const {
    state,
    messages,
    sendMessage,
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

  const { serverNow } = useServerClock();

  // Read at the moment the video ends rather than captured when the handler was
  // made, so a track finishing can't end whatever replaced it.
  const nowPlayingRef = useRef(null);
  const player = useYouTubePlayer(PLAYER_ID, () => {
    const current = nowPlayingRef.current;
    if (current) reportEnded(current.id);
  });

  const {
    ready,
    needsTap,
    unplayable,
    syncTo,
    stop,
    startPlayback,
    setVolume,
    getDurationMs,
  } = player;

  const nowPlaying = state?.nowPlaying ?? null;
  nowPlayingRef.current = nowPlaying;

  const reportedDurationFor = useRef(null);
  const reportedUnplayableFor = useRef(null);

  // Correcting only when the server happens to speak leaves a player free to
  // wander in between, and every listener wanders differently — which is what
  // an echo across the room actually is. This recomputes the target from the
  // station's start time against the shared clock, so drift is caught within a
  // second rather than whenever the next broadcast lands.
  useEffect(() => {
    if (!ready) return undefined;
    if (!nowPlaying) {
      stop();
      return undefined;
    }

    const { videoId, startedAtMs } = nowPlaying;

    function tick() {
      syncTo(videoId, serverNow() - startedAtMs);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ready, nowPlaying, serverNow, syncTo, stop]);

  // Tell the station how long this runs so the progress dial means something.
  // Advancing no longer depends on it — the player's own ended event does that.
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

  async function handleAddLink(input) {
    const videoId = parseVideoId(input);
    if (!videoId) {
      setAddError("That doesn't look like a YouTube link. Paste the address from the video.");
      return false;
    }
    setAddError(null);
    const title = (await fetchTitle(videoId)) || 'Untitled track';
    const ok = await addToQueue({ videoId, title, durationMs: 0 });
    if (!ok) setAddError("Couldn't reach the station. Check your connection and try again.");
    return ok;
  }

  async function handleAddResult(result) {
    setAddError(null);
    const ok = await addToQueue({
      videoId: result.videoId,
      title: result.title,
      durationMs: result.durationMs || 0,
    });
    if (!ok) setAddError("Couldn't reach the station. Check your connection and try again.");
    return ok;
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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

      <Listeners names={state?.listeners ?? []} me={name} />

      {!connected && <p className="room__error">Reconnecting to the station…</p>}

      <div className="radio-console">
        <OnAirIndicator isLive={Boolean(nowPlaying) && !needsTap} />

        {/* Always mounted, so the player has something to attach to. */}
        <div className={`player-frame ${nowPlaying ? '' : 'player-frame--idle'}`}>
          <div id={PLAYER_ID} />
          {needsTap && (
            <button className="player-frame__gate" onClick={startPlayback}>
              <span className="player-frame__gate-icon" aria-hidden="true">
                ▶
              </span>
              Tap to start listening
            </button>
          )}
        </div>

        <TuningDial
          positionMs={nowPlaying?.positionMs}
          durationMs={nowPlaying?.durationMs}
          isPaused={!nowPlaying || needsTap}
        />

        <FrequencyDisplay
          trackName={nowPlaying?.title ?? 'Dead air — queue something'}
          artistName={
            nowPlaying
              ? nowPlaying.isRerun
                ? `back from the archives · ${nowPlaying.addedBy} put this on`
                : `added by ${nowPlaying.addedBy}`
              : null
          }
        />


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

        <AddTrack onAddLink={handleAddLink} onAddResult={handleAddResult} />
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
                  <span className="history__body">
                    <span className="history__title">{item.title}</span>
                    {/* Credit is the whole discovery mechanic: you remember who put
                        you onto something long after you've forgotten the song. */}
                    <span className="history__by">
                      {item.isRerun ? 'rerun · ' : ''}
                      {item.addedBy}
                    </span>
                  </span>
                  <span className="history__score">
                    ▲ {item.ratings.up} ▼ {item.ratings.down}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Outside the console, so a phone keyboard opening over it doesn't take
          the player with it. */}
      <Chat messages={messages} onSend={sendMessage} me={name} />
    </div>
  );
}

export default StationRoom;
