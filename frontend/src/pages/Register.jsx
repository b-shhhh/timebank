import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordStrength from '../components/PasswordStrength';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await register(form.email, form.password, form.displayName);
      setMessage(res.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.data?.details ? err.data.details.map((d) => d.msg).join(' ') : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-paper">Time<span className="text-brass">Bank</span></h1>
          <p className="text-paper/50 text-sm mt-1">Trade an hour of skill for an hour of skill.</p>
        </div>
        <div className="card p-7">
          {message ? (
            <p className="text-sage text-sm text-center">{message}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="label-eyebrow">Create account</h2>
              <div>
                <label className="text-sm text-ink-700 block mb-1">Display name</label>
                <input className="input-field" required minLength={2} maxLength={40} value={form.displayName} onChange={update('displayName')} />
              </div>
              <div>
                <label className="text-sm text-ink-700 block mb-1">Email</label>
                <input className="input-field" type="email" required value={form.email} onChange={update('email')} />
              </div>
              <div>
                <label className="text-sm text-ink-700 block mb-1">Password</label>
                <input className="input-field" type="password" required value={form.password} onChange={update('password')} />
                <PasswordStrength password={form.password} />
              </div>
              {error && <p className="text-rust text-sm">{error}</p>}
              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
              <p className="text-sm text-ink-700 text-center pt-2">
                Already have an account? <Link to="/login" className="text-brass-dark font-medium">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
