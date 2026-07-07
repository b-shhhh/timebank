import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, setUnauthorizedHandler, tryRefresh } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logoutLocal = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logoutLocal);
    (async () => {
      const ok = await tryRefresh();
      if (ok) {
        try {
          const me = await api.get('/profiles/me');
          setUser(me);
        } catch {
          logoutLocal();
        }
      }
      setLoading(false);
    })();
  }, [logoutLocal]);

  const login = async (email, password, captchaToken) => {
    const data = await api.post('/auth/login', { email, password, captchaToken });
    if (data.mfaRequired) return { mfaRequired: true, pendingToken: data.pendingToken };
    setAccessToken(data.accessToken);
    setUser(data.user);
    return { mfaRequired: false };
  };

  const verifyMfa = async (pendingToken, code, isBackupCode = false) => {
    const data = await api.post('/auth/mfa/verify-login', { pendingToken, code, isBackupCode });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const register = (email, password, displayName) =>
    api.post('/auth/register', { email, password, displayName });

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* best-effort */ }
    logoutLocal();
  };

  const refreshProfile = async () => {
    const me = await api.get('/profiles/me');
    setUser(me);
    return me;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
