/** The running order, and who put each thing there. */
function Queue({ items, onRemove }) {
  if (items.length === 0) {
    return <p className="queue__empty">Nothing queued yet — paste a link to start the night.</p>;
  }

  return (
    <ol className="queue">
      {items.map((item, index) => (
        <li key={item.id} className="queue__item">
          <span className="queue__position">{index + 1}</span>
          <span className="queue__body">
            <span className="queue__title">{item.title}</span>
            <span className="queue__by">added by {item.addedBy}</span>
          </span>
          <button
            className="queue__remove"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.title} from the queue`}
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}

export default Queue;
