import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCallback } from '../spotify/spotifyAuth';

function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    handleCallback(window.location.search)
      .then((next) => navigate(next, { replace: true }))
      .catch((err) => setError(err.message));
  }, [navigate]);

  return (
    <div className="callback">
      {error ? (
        <>
          <p className="callback__error">Login failed: {error}</p>
          <a href="/">Back to Analog Radio</a>
        </>
      ) : (
        <p>Tuning in…</p>
      )}
    </div>
  );
}

export default Callback;
