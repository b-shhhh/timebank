import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Dashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    api.get('/bookings/mine').then(setBookings).catch(() => {});
  }, []);

  const pending = bookings.filter((b) => ['REQUESTED', 'ACCEPTED'].includes(b.status));

  return (
    <Layout>
      <div className="mb-12">
        <p className="label-eyebrow mb-1">Welcome back</p>
        <h1 className="font-display text-4xl text-paper">{user?.displayName}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="card p-6">
          <p className="text-xs uppercase tracking-widest text-ink-700/60 mb-2">Time credits</p>
          <p className="font-mono text-4xl text-brass-dark">{user?.timeCredits}<span className="text-2xl">h</span></p>
        </div>
        <div className="card p-6">
          <p className="text-xs uppercase tracking-widest text-ink-700/60 mb-2">Open bookings</p>
          <p className="font-mono text-4xl text-ink-900">{pending.length}</p>
        </div>
        <div className="card p-6 flex flex-col justify-between">
          <p className="text-xs uppercase tracking-widest text-ink-700/60 mb-2">Find help</p>
          <Link to="/browse" className="text-brass-dark font-semibold text-lg hover:underline">Browse skills &rarr;</Link>
        </div>
      </div>

      <h2 className="font-display text-2xl text-paper mb-4">Recent bookings</h2>
      <div className="card divide-y divide-ink-700/10">
        {bookings.length === 0 && <p className="p-6 text-ink-700/60 text-sm">No bookings yet. Browse skills to get started.</p>}
        {bookings.slice(0, 6).map((b) => (
          <div key={b.id} className="p-4 flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-ink-900">{b.skill}</p>
              <p className="text-ink-700/60">{b.provider.displayName} &harr; {b.requester.displayName} &middot; {b.hours}h</p>
            </div>
            <span className="font-mono text-xs px-2 py-1 rounded bg-ink-900/5 text-ink-700">{b.status}</span>
          </div>
        ))}
      </div>
    </Layout>
  );
}
