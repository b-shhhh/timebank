import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Client-side gating is a UX convenience only, not a security boundary -
// every real authorization decision (RBAC, ownership) is enforced again
// server-side, since a client-side check can always be bypassed.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-paper/60 text-center py-20">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
