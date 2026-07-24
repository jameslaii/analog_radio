import { BrowserRouter, Routes, Route, useParams, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Callback from './pages/Callback';
import HostRoom from './pages/HostRoom';
import ListenerRoom from './pages/ListenerRoom';

function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const isHost = Boolean(location.state?.isHost);

  return isHost ? <HostRoom roomId={roomId} /> : <ListenerRoom roomId={roomId} />;
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
