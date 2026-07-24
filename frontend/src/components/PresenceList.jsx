function PresenceList({ listenerCount }) {
  return (
    <div className="presence-list">
      <span className="presence-list__count">{listenerCount}</span>
      <span className="presence-list__label">
        {listenerCount === 1 ? 'friend tuned in' : 'friends tuned in'}
      </span>
    </div>
  );
}

export default PresenceList;
