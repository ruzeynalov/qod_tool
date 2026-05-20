'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/_providers/auth-provider';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function LoginPage() {
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const { setDemoMode } = useDemoMode();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginValue, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid credentials');
      }

      const { accessToken, user } = await res.json();
      authLogin(accessToken, user);
      router.push('/projects');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-qod-bg">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-qod-border bg-qod-surface p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-qod-accent text-white font-bold text-lg">
            Q
          </div>
          <h1 className="text-xl font-semibold text-primary">Sign in to QOD</h1>
          <p className="mt-1 text-sm text-muted">Quality Observability Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-md bg-rag-red/10 px-3 py-2 text-sm text-rag-red">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login" className="mb-1 block text-xs font-medium text-secondary">
              Email or Username
            </label>
            <input
              id="login"
              type="text"
              required
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder="Enter your email or username"
              className="w-full rounded-md border border-qod-border bg-qod-bg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-qod-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-md border border-qod-border bg-qod-bg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-qod-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-qod-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-qod-accent/90 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-qod-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-qod-surface px-2 text-muted">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('qod-auth-token');
            localStorage.removeItem('qod-auth-user');
            setDemoMode(true);
            router.replace('/');
          }}
          className="w-full rounded-lg border border-qod-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-qod-accent hover:bg-qod-bg"
        >
          Explore demo
        </button>
        <p className="text-center text-xs text-muted">
          Client-side sample data — no API or database required
        </p>
      </div>
    </div>
  );
}
