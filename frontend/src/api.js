const BASE = '/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path, token) => request(path, { token }),
  post: (path, body, token) => request(path, { method: 'POST', body, token }),
  put: (path, body, token) => request(path, { method: 'PUT', body, token }),
  del: (path, token) => request(path, { method: 'DELETE', token }),
};

export function saveSession({ token, user, profile }) {
  localStorage.setItem('hunar_session', JSON.stringify({ token, user, profile }));
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('hunar_session'));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('hunar_session');
}

export const fmt = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
