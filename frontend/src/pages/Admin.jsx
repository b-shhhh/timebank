import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const ROLES = ['MEMBER', 'MEDIATOR', 'ADMIN'];

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [fees, setFees] = useState([]);
  const [tab, setTab] = useState('users');
  const [error, setError] = useState('');

  const loadUsers = () =>
    api.get('/admin/users')
      .then(setUsers)
      .catch((e) => setError(e.message));

  const loadLogs = () =>
    api.get('/admin/activity-logs')
      .then(setLogs)
      .catch((e) => setError(e.message));

  const loadFees = () =>
    api.get('/payments/service-fees')
      .then(setFees)
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab]);

  useEffect(() => {
    if (tab === 'fees') loadFees();
  }, [tab]);

  const setRole = async (id, role) => {
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const unlock = async (id) => {
    try {
      await api.patch(`/admin/users/${id}/unlock`);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalFees = fees.reduce(
    (sum, f) => sum + f.amountCredits,
    0
  );

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-2">
        Admin
      </h1>

      <p className="text-paper/50 text-sm mb-6">
        Manage users and view activity logs.
      </p>

      <div className="flex gap-4 mb-6 text-sm">
        <button
          onClick={() => setTab('users')}
          className={`pb-1 ${
            tab === 'users'
              ? 'text-brass border-b-2 border-brass'
              : 'text-paper/50'
          }`}
        >
          Users
        </button>

        <button
          onClick={() => setTab('logs')}
          className={`pb-1 ${
            tab === 'logs'
              ? 'text-brass border-b-2 border-brass'
              : 'text-paper/50'
          }`}
        >
          Activity logs
        </button>

        <button
          onClick={() => setTab('fees')}
          className={`pb-1 ${
            tab === 'fees'
              ? 'text-brass border-b-2 border-brass'
              : 'text-paper/50'
          }`}
        >
          Service fees
        </button>
      </div>

      {error && (
        <p className="text-rust text-sm mb-4">
          {error}
        </p>
      )}

      {tab === 'users' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-700/50 border-b border-ink-900/10">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Credits</th>
                <th className="p-3">MFA</th>
                <th className="p-3">Locked</th>
                <th className="p-3"></th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-ink-900/5 last:border-0"
                >
                  <td className="p-3">
                    {u.displayName}
                  </td>

                  <td className="p-3 text-ink-700/70">
                    {u.email}
                  </td>

                  <td className="p-3">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        setRole(u.id, e.target.value)
                      }
                      className="input-field py-1 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-3 font-mono">
                    {u.timeCredits}h
                  </td>

                  <td className="p-3">
                    {u.mfaEnabled ? 'Yes' : 'No'}
                  </td>

                  <td className="p-3">
                    {u.lockedUntil &&
                    new Date(u.lockedUntil) > new Date() ? (
                      <button
                        onClick={() => unlock(u.id)}
                        className="text-xs text-rust underline"
                      >
                        Locked · unlock
                      </button>
                    ) : (
                      'No'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card divide-y divide-ink-900/5 max-h-[32rem] overflow-y-auto">
          {logs.map((l) => (
            <div
              key={l.id}
              className="p-3 text-xs font-mono flex justify-between"
            >
              <span>{l.action}</span>

              <span className="text-ink-700/50">
                {new Date(l.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'fees' && (
        <div>
          <div className="card p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-paper/70">
              Total service fees collected
            </p>

            <p className="font-mono text-2xl text-brass-dark">
              {totalFees}h
            </p>
          </div>

          <div className="card divide-y divide-ink-900/5 max-h-[32rem] overflow-y-auto">
            {fees.length === 0 && (
              <p className="p-4 text-sm text-paper/50">
                No service fees collected yet.
              </p>
            )}

            {fees.map((f) => (
              <div
                key={f.id}
                className="p-3 flex items-center justify-between text-sm"
              >
                <div>
                  <p className="text-paper">
                    Booking fee
                  </p>

                  <p className="text-paper/50 text-xs">
                    {f.bookingId
                      ? `Booking ${f.bookingId.slice(0, 8)}...`
                      : 'N/A'}
                  </p>
                </div>

                <p className="font-mono text-rust">
                  {f.amountCredits}h
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}