// Thin fetch wrapper. Access tokens are held only in memory (module-level
// variable, never localStorage/sessionStorage) so an XSS payload that can
// run JS can't trivially read a persisted token out of storage - the
// refresh token (which CAN survive a reload) lives in an httpOnly cookie
// set by the server and is never readable from JS at all.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

let accessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include', // send the httpOnly refresh cookie
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) return request(path, { method, body, retry: false });
    if (onUnauthorized) onUnauthorized();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed with status ${res.status}`);
    err.details = data.details;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
};

export { tryRefresh };
