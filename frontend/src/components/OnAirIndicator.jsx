function OnAirIndicator({ isLive }) {
  return (
    <div className={`on-air ${isLive ? 'on-air--live' : ''}`}>
      <span className="on-air__dot" />
      <span className="on-air__label">{isLive ? 'ON AIR' : 'OFF AIR'}</span>
    </div>
  );
}

export default OnAirIndicator;
