/**
 * The server's listener count always includes the current listener (if any), so from the
 * listener's own point of view it's read as "how many others are here with me" rather than
 * a raw total.
 */
function PresenceList({ listenerCount, isHost = false }) {
  if (isHost) {
    return (
      <div className="presence-list">
        <span className="presence-list__count">{listenerCount}</span>
        <span className="presence-list__label">
          {listenerCount === 0
            ? 'waiting for friends to tune in'
            : listenerCount === 1
              ? 'friend tuned in'
              : 'friends tuned in'}
        </span>
      </div>
    );
  }

  const othersCount = Math.max(listenerCount - 1, 0);
  return (
    <div className="presence-list">
      <span className="presence-list__count">{othersCount}</span>
      <span className="presence-list__label">
        {othersCount === 0
          ? "you're the only one tuned in right now"
          : othersCount === 1
            ? 'other friend tuned in'
            : 'other friends tuned in'}
      </span>
    </div>
  );
}

export default PresenceList;
