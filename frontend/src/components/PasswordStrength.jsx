// Client-side strength feedback only - the authoritative policy check
// always happens server-side (see backend/src/utils/password.js). This
// is purely UX guidance so users aren't surprised by a rejection.
export default function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 12) score += 2; else if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const idx = Math.max(0, Math.min(labels.length - 1, score));
  const colors = ['bg-rust', 'bg-rust', 'bg-brass-dark', 'bg-brass', 'bg-sage', 'bg-sage-light'];
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full bg-ink-700 rounded-full overflow-hidden">
        <div className={`h-full ${colors[idx]} transition-all`} style={{ width: `${((idx + 1) / labels.length) * 100}%` }} />
      </div>
      <p className="text-xs text-paper/60 mt-1">{labels[idx]} &middot; min 12 characters, mix of cases, numbers &amp; symbols</p>
    </div>
  );
}
