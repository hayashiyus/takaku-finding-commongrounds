import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import PrintView from './pages/PrintView';
import Room from './pages/Room';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/r/:roomId/print" element={<PrintView />} />
      <Route path="/r/:roomId" element={<Room />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
