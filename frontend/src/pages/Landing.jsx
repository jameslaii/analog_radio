import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, isLoggedIn } from '../spotify/spotifyAuth';
import { socket } from '../sync/socket';

function Landing() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const loggedIn = isLoggedIn();

  function handleConnect() {
    login('/');
  }

  function handleCreateRoom() {
    setCreating(true);
    setError(null);
    if (!socket.connected) socket.connect();

    socket.emit('room:create', {}, ({ roomId }) => {
      setCreating(false);
      if (!roomId) {
        setError('Could not create a room. Try again.');
        return;
      }
      navigate(`/room/${roomId}`, { state: { isHost: true } });
    });
  }

  return (
    <div className="landing">
      <div className="landing__radio-glow" />
      <h1 className="landing__title">Analog Radio</h1>
      <p className="landing__subtitle">Tune your friends into your Spotify, live.</p>

      {!loggedIn ? (
        <button className="landing__button" onClick={handleConnect}>
          Connect Spotify
        </button>
      ) : (
        <button className="landing__button" onClick={handleCreateRoom} disabled={creating}>
          {creating ? 'Creating station…' : 'Start Broadcasting'}
        </button>
      )}

      {error && <p className="landing__error">{error}</p>}

      <p className="landing__hint">
        Requires Spotify Premium. Friends join by opening the link you share after you go live.
      </p>
    </div>
  );
}

export default Landing;
