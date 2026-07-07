import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import PasswordStrength from '../components/PasswordStrength';

export default function Profile() {
  const { user, refreshProfile } = useAuth();
  const [bio, setBio] = useState(user?.bio || '');
  const [skillsOffered, setSkillsOffered] = useState((user?.skillsOffered || []).join(', '));
  const [isProfilePrivate, setIsProfilePrivate] = useState(user?.isProfilePrivate || false);
  const [saveMsg, setSaveMsg] = useState('');

  const [mfaStep, setMfaStep] = useState('idle');
  const [qr, setQr] = useState(null);
  const [base32Secret, setBase32Secret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [mfaError, setMfaError] = useState('');

  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaveMsg('');
    try {
      await api.patch('/profiles/me', {
        bio,
        skillsOffered: skillsOffered.split(',').map((s) => s.trim()).filter(Boolean),
        isProfilePrivate,
      });
      await refreshProfile();
      setSaveMsg('Profile updated.');
    } catch (err) {
      setSaveMsg(err.message);
    }
  };

  const startMfaSetup = async () => {
    setMfaError('');
    const data = await api.post('/mfa/setup');
    setQr(data.qrDataUrl);
    setBase32Secret(data.base32Secret);
    setMfaStep('confirm');
  };

  const confirmMfa = async (e) => {
    e.preventDefault();
    setMfaError('');
    try {
      const data = await api.post('/mfa/confirm', { base32Secret, code: mfaCode, currentPassword: mfaPassword });
      setBackupCodes(data.backupCodes);
      await refreshProfile();
      setMfaStep('done');
    } catch (err) {
      setMfaError(err.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    try {
      const res = await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      setPwMsg(res.message);
    } catch (err) {
      setPwMsg(err.data?.details ? err.data.details.map((d) => d.msg).join(' ') : err.message);
    }
  };

  const exportData = async () => {
    const data = await api.get('/profiles/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timebank-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-8">Your profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={saveProfile} className="card p-6 space-y-4">
          <h2 className="label-eyebrow">Personalisation</h2>
          <div>
            <label className="text-sm text-ink-700 block mb-1">Bio</label>
            <textarea className="input-field" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-ink-700 block mb-1">Skills you offer (comma separated)</label>
            <input className="input-field" value={skillsOffered} onChange={(e) => setSkillsOffered(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={isProfilePrivate} onChange={(e) => setIsProfilePrivate(e.target.checked)} />
            Keep my email & balance private from other members
          </label>
          {saveMsg && <p className="text-sage text-sm">{saveMsg}</p>}
          <button className="btn-primary">Save changes</button>
          <button type="button" onClick={exportData} className="text-sm text-ink-700 underline block">
            Export my data (JSON)
          </button>
        </form>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="label-eyebrow mb-3">Multi-factor authentication</h2>
            {user?.mfaEnabled ? (
              <p className="text-sage text-sm">MFA is enabled on your account.</p>
            ) : mfaStep === 'idle' ? (
              <>
                <p className="text-sm text-ink-700 mb-3">Add an authenticator app as a second factor for login.</p>
                <button onClick={startMfaSetup} className="btn-primary text-sm">Set up MFA</button>
              </>
            ) : mfaStep === 'confirm' ? (
              <form onSubmit={confirmMfa} className="space-y-3">
                {qr && <img src={qr} alt="MFA QR code" className="w-40 h-40 mx-auto" />}
                <p className="text-xs text-ink-700/70 text-center">Scan with Google Authenticator, Authy, etc.</p>
                <input className="input-field font-mono text-center tracking-widest" placeholder="6-digit code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                <input className="input-field" type="password" placeholder="Confirm your password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
                {mfaError && <p className="text-rust text-sm">{mfaError}</p>}
                <button className="btn-primary w-full text-sm">Confirm & enable</button>
              </form>
            ) : (
              <div>
                <p className="text-sage text-sm mb-2">MFA enabled! Save these one-time backup codes somewhere safe:</p>
                <div className="font-mono text-xs bg-ink-900/5 rounded p-3 grid grid-cols-2 gap-1">
                  {backupCodes?.map((c) => <span key={c}>{c}</span>)}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={changePassword} className="card p-6 space-y-3">
            <h2 className="label-eyebrow">Change password</h2>
            <input className="input-field" type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
            <input className="input-field" type="password" placeholder="New password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
            <PasswordStrength password={pw.next} />
            {pwMsg && <p className="text-sm text-ink-700">{pwMsg}</p>}
            <button className="btn-primary text-sm">Update password</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}