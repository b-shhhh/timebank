import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [pendingToken, setPendingToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password, captchaToken || undefined);
      if (result.mfaRequired) {
        setPendingToken(result.pendingToken);
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.data?.requireCaptcha) setNeedsCaptcha(true);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verifyMfa(pendingToken, mfaCode, isBackupCode);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl text-paper mb-2">Time<span className="text-brass">Bank</span></h1>
          <p className="text-paper/50 text-sm">Trade an hour of skill for an hour of skill.</p>
        </div>
        <div className="card p-8">
          {!pendingToken ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="label-eyebrow">Sign in</h2>
              <div>
                <label className="text-sm text-ink-700 block mb-1">Email</label>
                <input className="input-field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-ink-700 block mb-1">Password</label>
                <input className="input-field" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {needsCaptcha && (
                <div>
                  <label className="text-sm text-ink-700 block mb-1">
                    Verification required after repeated attempts (demo token: <code>DEV_BYPASS_TOKEN</code>)
                  </label>
                  <input className="input-field" value={captchaToken} onChange={(e) => setCaptchaToken(e.target.value)} placeholder="CAPTCHA token" />
                </div>
              )}
              {error && <p className="text-rust text-sm">{error}</p>}
              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
              <p className="text-sm text-ink-700 text-center pt-2">
                No account? <Link to="/register" className="text-brass-dark font-medium">Register</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <h2 className="label-eyebrow">Verify it&rsquo;s you</h2>
              <p className="text-sm text-ink-700">Enter the 6-digit code from your authenticator app.</p>
              <input className="input-field font-mono tracking-widest text-center" maxLength={8} required value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={isBackupCode} onChange={(e) => setIsBackupCode(e.target.checked)} />
                This is a backup code
              </label>
              {error && <p className="text-rust text-sm">{error}</p>}
              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
