import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ink-900 text-paper">
      <header className="border-b border-ink-700/30 bg-ink-900/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-2xl tracking-tight hover:text-brass transition-colors">
            Time<span className="text-brass">Bank</span>
          </Link>
          {user && (
            <nav className="flex items-center gap-5 text-sm">
              <Link to="/browse" className="hover:text-brass transition-colors">Browse skills</Link>
              <Link to="/bookings" className="hover:text-brass transition-colors">Bookings</Link>
              <Link to="/profile" className="hover:text-brass transition-colors">Profile</Link>
              {(user.role === 'MEDIATOR' || user.role === 'ADMIN') && (
                <Link to="/disputes" className="hover:text-brass transition-colors">Disputes</Link>
              )}
              {user.role === 'ADMIN' && (
                <Link to="/admin" className="hover:text-brass transition-colors">Admin</Link>
              )}
              <div className="flex flex-col items-end leading-none border border-brass/40 rounded px-3 py-1.5 bg-ink-900/30">
                <span className="text-[10px] uppercase tracking-widest text-brass/80">Balance</span>
                <span className="font-mono text-lg text-brass-light">{user.timeCredits}h</span>
              </div>
              <button onClick={handleLogout} className="btn-secondary text-xs py-1.5">Log out</button>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-12">{children}</main>
    </div>
  );
}
