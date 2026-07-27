import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-ink-900 text-paper">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <span className="font-display text-2xl tracking-tight">
          Time<span className="text-brass">Bank</span>
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/login" className="hover:text-brass transition-colors">Sign in</Link>
          <Link to="/register" className="btn-primary text-sm py-1.5">Get started</Link>
        </nav>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
          <p className="label-eyebrow inline-block mb-4">Community skill-exchange</p>
          <h1 className="font-display text-5xl sm:text-6xl leading-tight mb-6">
            Trade an hour of skill<br />for an hour of skill.
          </h1>
          <p className="text-paper/60 text-lg max-w-xl mx-auto mb-10">
            TimeBank lets neighbours trade help directly — tutoring, repairs, design,
            whatever you're good at — using time-credits instead of money. One hour
            given equals one hour earned, no matter the skill.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/register" className="btn-primary">Create your account</Link>
            <Link to="/login" className="btn-secondary">Sign in</Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="card p-6">
            <p className="label-eyebrow mb-2">Fair by design</p>
            <h2 className="font-display text-xl text-ink-900 mb-2">Every hour counts the same</h2>
            <p className="text-sm text-ink-700/70">
              An hour of guitar lessons is worth the same as an hour of bike repair.
              No market pricing, just time.
            </p>
          </div>
          <div className="card p-6">
            <p className="label-eyebrow mb-2">Bank your time</p>
            <h2 className="font-display text-xl text-ink-900 mb-2">Give now, spend later</h2>
            <p className="text-sm text-ink-700/70">
              Help someone out today, and use the credit whenever you need
              a hand yourself.
            </p>
          </div>
          <div className="card p-6">
            <p className="label-eyebrow mb-2">Secure by default</p>
            <h2 className="font-display text-xl text-ink-900 mb-2">Built to protect you</h2>
            <p className="text-sm text-ink-700/70">
              Two-factor authentication, encrypted secrets, and full activity
              logging keep your account and your community safe.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-700/30">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center text-xs text-paper/40">
          TimeBank &middot; a community skill-exchange platform
        </div>
      </footer>
    </div>
  );
}