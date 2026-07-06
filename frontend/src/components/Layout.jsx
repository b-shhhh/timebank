import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Signature element: the top bar renders the user's time-credit balance
// as a stamped ledger "ticket" (mono type, brass rule above and below)
// rather than a generic badge - reinforcing the app's core idea that
// hours, not money, are the unit of account here.
export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ink-900 text-paper">
      <header className="border-b border-ink-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-2xl tracking-tight">
            Time<span className="text-brass">Bank</span>
          </Link>
          {user && (
            <nav className="flex items-center gap-6 text-sm">
              <Link to="/browse" className="hover:text-brass transition-colors">Browse skills</Link>
              <Link to="/bookings" className="hover:text-brass transition-colors">Bookings</Link>
              <Link to="/profile" className="hover:text-brass transition-colors">Profile</Link>
              {(user.role === 'MEDIATOR' || user.role === 'ADMIN') && (
                <Link to="/disputes" className="hover:text-brass transition-colors">Disputes</Link>
              )}
              {user.role === 'ADMIN' && (
                <Link to="/admin" className="hover:text-brass transition-colors">Admin</Link>
              )}
              <div className="flex flex-col items-end leading-none border-t border-b border-brass/60 px-3 py-1">
                <span className="text-[10px] uppercase tracking-widest text-brass/80">Balance</span>
                <span className="font-mono text-lg text-brass-light">{user.timeCredits}h</span>
              </div>
              <button onClick={handleLogout} className="btn-secondary text-xs py-1.5">Log out</button>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
