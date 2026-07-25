import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import Landing from './pages/Landing';
import Callback from './pages/Callback';
import HostRoom from './pages/HostRoom';
import ListenerRoom from './pages/ListenerRoom';

function RoomPage() {
  const { roomId } = useParams();
  // Read from sessionStorage rather than router navigation state, so host
  // status survives a page refresh instead of silently demoting the host to
  // a listener of their own room.
  const hostToken = sessionStorage.getItem(`analog_radio_host_${roomId}`);

  return hostToken ? (
    <HostRoom roomId={roomId} hostToken={hostToken} />
  ) : (
    <ListenerRoom roomId={roomId} />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
