'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/_providers/auth-provider';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { demoMode } = useDemoMode();
  const router = useRouter();

  useEffect(() => {
    if (!demoMode && !isAuthenticated) {
      router.replace('/login');
    }
  }, [demoMode, isAuthenticated, router]);

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
