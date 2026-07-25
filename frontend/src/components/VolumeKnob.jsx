import { useState } from 'react';

/**
 * Local-only volume (each listener's own; never synced across the room).
 *
 * The knob and slider carried no visible label, so it read as an ornament
 * nobody could identify — a control that doesn't say what it does may as well
 * not be there. The reading doubles as confirmation that dragging did anything.
 */
function VolumeKnob({ onChange }) {
  const [volume, setVolume] = useState(80);

  function handleChange(e) {
    const value = Number(e.target.value);
    setVolume(value);
    onChange?.(value / 100);
  }

  const rotation = (volume / 100) * 270 - 135;

  return (
    <div className="volume-knob">
      <div className="volume-knob__dial" style={{ transform: `rotate(${rotation}deg)` }}>
        <div className="volume-knob__mark" />
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={handleChange}
        aria-label="Volume"
        className="volume-knob__slider"
      />
      <span className="volume-knob__label">
        Volume<span className="volume-knob__value">{volume}</span>
      </span>
    </div>
  );
}

export default VolumeKnob;
