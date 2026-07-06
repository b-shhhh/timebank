import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');

  const load = () => api.get('/disputes').then(setDisputes).catch(() => {});
  useEffect(() => { load(); }, []);

  const resolve = async (id, outcome) => {
    setError('');
    try {
      await api.patch(`/disputes/${id}/resolve`, { outcome, resolutionNotes: notes[id] || '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-2">Dispute queue</h1>
      <p className="text-paper/50 text-sm mb-6">Visible only to mediators &amp; admins.</p>
      {error && <p className="text-rust text-sm mb-4">{error}</p>}
      <div className="space-y-4">
        {disputes.length === 0 && <p className="text-paper/50 text-sm">No open disputes.</p>}
        {disputes.map((d) => (
          <div key={d.id} className="card p-5">
            <p className="font-medium text-ink-900">Booking: {d.booking.skill} &middot; {d.booking.hours}h</p>
            <p className="text-sm text-ink-700 mt-1">{d.reason}</p>
            <textarea
              className="input-field mt-3 text-sm"
              placeholder="Resolution notes"
              rows={2}
              value={notes[d.id] || ''}
              onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => resolve(d.id, 'PROVIDER')} className="btn-primary text-xs">Favour provider</button>
              <button onClick={() => resolve(d.id, 'REQUESTER')} className="text-xs bg-sage text-white px-3 py-2 rounded-md">Favour requester</button>
              <button onClick={() => resolve(d.id, 'SPLIT')} className="text-xs bg-ink-700 text-white px-3 py-2 rounded-md">No transfer / close</button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
