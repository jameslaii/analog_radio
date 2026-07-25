/**
 * How the room is taking the current track. Ratings are deliberately visible
 * while it plays rather than after — the point is the shared reaction, not a
 * verdict filed once the song is gone.
 */
function RatingBar({ ratings, onRate, disabled }) {
  const up = ratings?.up ?? 0;
  const down = ratings?.down ?? 0;

  return (
    <div className="rating-bar">
      <button
        className="rating-bar__button rating-bar__button--up"
        onClick={() => onRate(1)}
        disabled={disabled}
        aria-label="This is good"
      >
        <span aria-hidden="true">▲</span>
        <span className="rating-bar__count">{up}</span>
      </button>
      <button
        className="rating-bar__button rating-bar__button--down"
        onClick={() => onRate(-1)}
        disabled={disabled}
        aria-label="Not feeling this one"
      >
        <span aria-hidden="true">▼</span>
        <span className="rating-bar__count">{down}</span>
      </button>
    </div>
  );
}

export default RatingBar;
