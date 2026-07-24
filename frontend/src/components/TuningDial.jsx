/** Decorative rotating tuning dial. Rotation reflects playback progress within the current track. */
function TuningDial({ positionMs = 0, durationMs = 0, isPaused = true }) {
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const rotation = progress * 270 - 135; // sweep -135deg to +135deg

  return (
    <div className={`tuning-dial ${isPaused ? '' : 'tuning-dial--spinning'}`}>
      <div className="tuning-dial__face">
        <div
          className="tuning-dial__needle"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        <div className="tuning-dial__hub" />
      </div>
    </div>
  );
}

export default TuningDial;
