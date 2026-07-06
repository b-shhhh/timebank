import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Browse from './pages/Browse';
import Bookings from './pages/Bookings';
import Disputes from './pages/Disputes';
import Admin from './pages/Admin';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
      <Route path="/disputes" element={<ProtectedRoute roles={['MEDIATOR', 'ADMIN']}><Disputes /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><Admin /></ProtectedRoute>} />
    </Routes>
  );
}
