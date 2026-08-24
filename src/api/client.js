const API = '/api';

export async function request(url, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  const response = await fetch(API + url, { ...opts, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || 'Request failed');
  }
  return response.headers.get('content-type')?.includes('application/json')
    ? response.json()
    : response;
}
