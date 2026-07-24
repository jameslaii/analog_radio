/** Faux FM-dial readout showing the currently playing track/artist as marquee text. */
function FrequencyDisplay({ trackName, artistName }) {
  const text = trackName ? `${trackName} — ${artistName}` : 'No signal';

  return (
    <div className="frequency-display">
      <div className="frequency-display__scale">
        {['88', '92', '96', '100', '104', '108'].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="frequency-display__readout">
        <span className="frequency-display__text">{text}</span>
      </div>
    </div>
  );
}

export default FrequencyDisplay;
