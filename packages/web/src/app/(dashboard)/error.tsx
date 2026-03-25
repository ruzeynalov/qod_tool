'use client';

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2 className="text-lg font-semibold text-primary">Something went wrong</h2>
      <p className="text-sm text-muted">{error.message}</p>
      <button onClick={reset} className="rounded-md bg-qod-accent px-4 py-2 text-sm text-white hover:opacity-90">
        Try again
      </button>
    </div>
  );
}
