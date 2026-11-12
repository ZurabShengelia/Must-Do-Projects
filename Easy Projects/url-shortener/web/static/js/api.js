export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status; this.code = code; this.fields = fields || {};
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }

  let res;
  try { res = await fetch(path, init); }
  catch { throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.'); }

  if (res.status === 204) return { data: null, meta: null };
  let payload = null;
  try { payload = await res.json(); } catch { }
  if (!res.ok) {
    const e = payload && payload.error;
    if (res.status === 429) throw new ApiError(429, 'rate_limited', (e && e.message) || 'Too many requests. Please wait a moment.');
    throw new ApiError(res.status, (e && e.code) || 'error', (e && e.message) || 'Something went wrong. Please try again.', e && e.fields);
  }
  return { data: payload && payload.data, meta: payload && payload.meta };
}

const qs = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.set(k, v);
  const s = u.toString();
  return s ? '?' + s : '';
};

export const api = {
  me: () => request('GET', '/api/v1/auth/me').then((r) => r.data),
  register: (email, password) => request('POST', '/api/v1/auth/register', { email, password }).then((r) => r.data),
  login: (email, password) => request('POST', '/api/v1/auth/login', { email, password }).then((r) => r.data),
  logout: () => request('POST', '/api/v1/auth/logout', {}),
  changePassword: (current_password, new_password) => request('PUT', '/api/v1/auth/password', { current_password, new_password }),
  createLink: (url, alias) => request('POST', '/api/v1/links', alias ? { url, alias } : { url }).then((r) => r.data),
  listLinks: (params) => request('GET', '/api/v1/links' + qs(params)),
  linkAnalytics: (id, days) => request('GET', `/api/v1/links/${encodeURIComponent(id)}/analytics${qs({ days })}`).then((r) => r.data),
  deleteLink: (id) => request('DELETE', `/api/v1/links/${encodeURIComponent(id)}`),
  summary: (days) => request('GET', `/api/v1/analytics/summary${qs({ days })}`).then((r) => r.data),
};
