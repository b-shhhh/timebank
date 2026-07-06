import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const statusColor = {
  REQUESTED: 'bg-ink-900/10 text-ink-700',
  ACCEPTED: 'bg-sage/15 text-sage',
  COMPLETED: 'bg-brass/15 text-brass-dark',
  DISPUTED: 'bg-rust/15 text-rust',
  CANCELLED: 'bg-ink-900/10 text-ink-700/50',
  DECLINED: 'bg-ink-900/10 text-ink-700/50',
};

export default function Bookings() {
  const { user, refreshProfile } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [disputeFor, setDisputeFor] = useState(null);
  const [reason, setReason] = useState('');

  const load = () => api.get('/bookings/mine').then(setBookings).catch(() => {});
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setError('');
    try {
      await api.patch(`/bookings/${id}/${action}`);
      await load();
      await refreshProfile();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitDispute = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/bookings/${disputeFor}/dispute`, { reason });
      setDisputeFor(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-6">Your bookings</h1>
      {error && <p className="text-rust text-sm mb-4">{error}</p>}
      <div className="card divide-y divide-ink-700/10">
        {bookings.length === 0 && <p className="p-5 text-ink-700/60 text-sm">No bookings yet.</p>}
        {bookings.map((b) => {
          const isProvider = b.providerId === user.id;
          return (
            <div key={b.id} className="p-4 flex items-center justify-between gap-4 text-sm">
              <div>
                <p className="font-medium text-ink-900">{b.skill} &middot; {b.hours}h</p>
                <p className="text-ink-700/60">
                  {isProvider ? `Requested by ${b.requester.displayName}` : `Provider: ${b.provider.displayName}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs px-2 py-1 rounded ${statusColor[b.status] || ''}`}>{b.status}</span>
                {isProvider && b.status === 'REQUESTED' && (
                  <button onClick={() => act(b.id, 'accept')} className="btn-primary text-xs py-1">Accept</button>
                )}
                {!isProvider && b.status === 'ACCEPTED' && (
                  <button onClick={() => act(b.id, 'complete')} className="btn-primary text-xs py-1">Confirm complete</button>
                )}
                {['REQUESTED', 'ACCEPTED'].includes(b.status) && (
                  <button onClick={() => act(b.id, 'cancel')} className="text-xs text-ink-700 underline">Cancel</button>
                )}
                {['ACCEPTED', 'COMPLETED'].includes(b.status) && (
                  <button onClick={() => setDisputeFor(b.id)} className="text-xs text-rust underline">Dispute</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {disputeFor && (
        <div className="fixed inset-0 bg-ink-950/70 flex items-center justify-center px-6" onClick={() => setDisputeFor(null)}>
          <form onSubmit={submitDispute} className="card p-6 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="label-eyebrow">Raise a dispute</h2>
            <textarea className="input-field" required minLength={5} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong?" />
            <button className="btn-primary w-full">Submit to mediators</button>
          </form>
        </div>
      )}
    </Layout>
  );
}
