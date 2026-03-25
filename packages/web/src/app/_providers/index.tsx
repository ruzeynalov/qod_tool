'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';
import { DemoModeProvider } from './demo-mode-provider';
import { AuthProvider } from './auth-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <DemoModeProvider>{children}</DemoModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
