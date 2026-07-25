import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../sync/socket';

function Landing() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  function handleCreateStation() {
    setCreating(true);
    setError(null);
    if (!socket.connected) socket.connect();

    socket.timeout(8000).emit('station:create', {}, (timeoutErr, res) => {
      setCreating(false);
      if (timeoutErr) {
        setError("Couldn't reach the station server. Check your connection and try again.");
        return;
      }
      if (!res?.roomId) {
        setError('Could not start a station. Try again.');
        return;
      }
      navigate(`/room/${res.roomId}`);
    });
  }

  return (
    <div className="landing">
      <div className="landing__radio-glow" />
      <h1 className="landing__title">Analog Radio</h1>
      <p className="landing__subtitle">One queue, one room, everyone listening at once.</p>

      <button className="landing__button" onClick={handleCreateStation} disabled={creating}>
        {creating ? 'Starting station…' : 'Start a Station'}
      </button>

      {error && <p className="landing__error">{error}</p>}

      <p className="landing__hint">
        No accounts, no sign-in. Share the link, paste YouTube tracks into the queue, and rate
        what's playing as it plays.
      </p>
    </div>
  );
}

export default Landing;
