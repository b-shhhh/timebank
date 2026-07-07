import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

export default function Browse() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [bookingFor, setBookingFor] = useState(null);
  const [skill, setSkill] = useState('');
  const [hours, setHours] = useState(1);
  const [msg, setMsg] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    const data = await api.get(`/profiles${query ? `?skill=${encodeURIComponent(query)}` : ''}`);
    setResults(data);
  };

  useEffect(() => { search(); }, []);

  const requestBooking = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/bookings', { providerId: bookingFor.id, skill, hours: Number(hours) });
      setMsg(`Request sent to ${bookingFor.displayName}.`);
      setBookingFor(null);
      setSkill('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-6">Browse skills</h1>
      <form onSubmit={search} className="flex gap-2 mb-6">
        <input className="input-field bg-paper max-w-xs" placeholder="Search a skill (e.g. guitar)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-primary">Search</button>
      </form>
      {msg && <p className="text-sage text-sm mb-4">{msg}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {results.map((p) => (
          <div key={p.id} className="card p-5 flex flex-col">
            <p className="font-display text-lg text-ink-900">{p.displayName}</p>
            {p.bio && <p className="text-sm text-ink-700/70 mt-1 flex-grow">{p.bio}</p>}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.skillsOffered.map((s) => (
                <span key={s} className="text-xs bg-brass/15 text-brass-dark px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
            <button onClick={() => { setBookingFor(p); setSkill(p.skillsOffered[0] || ''); }} className="btn-primary text-xs mt-4 self-start">
              Request session
            </button>
          </div>
        ))}
        {results.length === 0 && <p className="text-paper/50 text-sm">No members found.</p>}
      </div>

      {bookingFor && (
        <div className="fixed inset-0 bg-ink-950/70 flex items-center justify-center px-6" onClick={() => setBookingFor(null)}>
          <form onSubmit={requestBooking} className="card p-6 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="label-eyebrow">Request session with {bookingFor.displayName}</h2>
            <input className="input-field" required value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill / topic" />
            <input className="input-field" type="number" min={1} max={8} value={hours} onChange={(e) => setHours(e.target.value)} />
            {error && <p className="text-rust text-sm">{error}</p>}
            <button className="btn-primary w-full">Send request</button>
          </form>
        </div>
      )}
    </Layout>
  );
}