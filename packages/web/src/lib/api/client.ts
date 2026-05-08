// ─── API client — thin wrapper around fetch for the QOD backend ───────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'qod-auth-token';

export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  // Fastify rejects requests with Content-Type: application/json and an
  // empty body, so only set the header when a body is actually sent.
  const headers: Record<string, string> = {
    ...(options?.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers as Record<string, string>),
  };

  // Auto-attach auth token if available
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('qod-auth-token');
        localStorage.removeItem('qod-auth-user');
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) message = body.message;
    } catch { /* ignore parse errors */ }
    throw new Error(message);
  }

  return res.json();
}
