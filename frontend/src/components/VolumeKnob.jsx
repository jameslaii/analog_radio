import { useState } from 'react';

/** Local-only volume control (each listener's own taste; never synced across the room). */
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
    </div>
  );
}

export default VolumeKnob;
