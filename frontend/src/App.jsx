import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import Landing from './pages/Landing';
import Station from './pages/Station';

function StationPage() {
  const { roomId } = useParams();
  return <Station roomId={roomId} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/room/:roomId" element={<StationPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
