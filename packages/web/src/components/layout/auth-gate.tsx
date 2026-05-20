'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/app/_providers/auth-provider';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { demoMode, hydrated } = useDemoMode();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!hydrated) return;
    if (!demoMode && !isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [demoMode, hydrated, isAuthenticated, pathname, router]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-qod-accent border-t-transparent" />
      </div>
    );
  }

  // In demo mode, always render. When authenticated, render.
  if (demoMode || isAuthenticated) {
    return <>{children}</>;
  }

  // Show nothing while redirecting
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-qod-accent border-t-transparent" />
    </div>
  );
}
