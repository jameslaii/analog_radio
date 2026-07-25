import { colourFor } from '../lib/personColour';

/**
 * Who is actually in the room.
 *
 * This existed before as a count and a run-on line of names, which read as a
 * statistic rather than as people — you couldn't tell at a glance who was here
 * with you. Given the whole point is listening together, it earns real space.
 */
function Listeners({ names, me }) {
  return (
    <div className="listeners">
      <div className="listeners__header">
        <span className="listeners__lamp" aria-hidden="true" />
        <h4>
          Tuned in
          <span className="listeners__count">{names.length}</span>
        </h4>
      </div>

      {names.length === 0 ? (
        <p className="listeners__empty">Nobody yet — send someone the link.</p>
      ) : (
        <ul className="listeners__list">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="listeners__person">
              <span className="listeners__dot" style={{ background: colourFor(n) }} />
              <span className="listeners__name">{n}</span>
              {n === me && <span className="listeners__you">you</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Listeners;
