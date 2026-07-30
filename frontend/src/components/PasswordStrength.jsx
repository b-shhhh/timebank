import { useMemo } from 'react';
import zxcvbn from 'zxcvbn';

export default function PasswordStrength({ password }) {
  const result = useMemo(() => {
    if (!password) return null;
    return zxcvbn(password);
  }, [password]);

  if (!result) return null;

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const idx = result.score;
  const colors = ['bg-rust', 'bg-rust', 'bg-brass-dark', 'bg-brass', 'bg-sage', 'bg-sage-light'];
  const suggestions = result.feedback?.suggestions || [];
  const warning = result.feedback?.warning || '';

  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full bg-ink-700 rounded-full overflow-hidden">
        <div className={`h-full ${colors[idx]} transition-all`} style={{ width: `${((idx + 1) / labels.length) * 100}%` }} />
      </div>
      <p className="text-xs text-paper/60 mt-1">
        {labels[idx]} &middot; {result.crack_times_display?.offline_slow_hashing_1e4_per_second || 'instant'} to crack
      </p>
      {warning && <p className="text-xs text-rust mt-0.5">{warning}</p>}
      {suggestions.length > 0 && (
        <ul className="text-xs text-paper/50 mt-0.5 list-disc list-inside">
          {suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}
    </div>
  );
}
