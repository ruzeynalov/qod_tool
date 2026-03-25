'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#f1f5f9' }}>Something went wrong</h1>
          <button
            onClick={reset}
            style={{ marginTop: '1.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#6366f1', color: '#fff', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
