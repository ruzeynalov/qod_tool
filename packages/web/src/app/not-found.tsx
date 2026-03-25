import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-qod-bg">
      <h1 className="text-4xl font-bold text-primary">404</h1>
      <p className="text-muted">Page not found</p>
      <Link href="/" className="rounded-md bg-qod-accent px-4 py-2 text-sm text-white hover:opacity-90">
        Go Home
      </Link>
    </div>
  );
}
