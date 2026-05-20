'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

const TOKEN_KEY = 'qod-auth-token';

interface DemoModeContextValue {
  demoMode: boolean;
  /** False until localStorage has been read — AuthGate must wait to avoid a login redirect flash. */
  hydrated: boolean;
  toggleDemoMode: () => void;
  setDemoMode: (enabled: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'qod-demo-mode';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const prevDemoMode = useRef<boolean | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    setDemoModeState(localStorage.getItem(STORAGE_KEY) === 'true');
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, String(demoMode));

    // Navigate when demo mode is toggled (not on initial load)
    if (prevDemoMode.current !== null && prevDemoMode.current !== demoMode) {
      queryClient.clear();
      const hasToken = localStorage.getItem(TOKEN_KEY);
      if (demoMode) {
        router.replace('/');
      } else if (!hasToken) {
        // Avoid pushing '/' while unauthenticated — AuthGate would spin forever
        router.replace('/login');
      } else {
        router.replace('/');
      }
    }
    prevDemoMode.current = demoMode;
  }, [demoMode, hydrated, router, queryClient]);

  const toggleDemoMode = useCallback(() => {
    setDemoModeState((prev) => !prev);
  }, []);

  const setDemoMode = useCallback((enabled: boolean) => {
    setDemoModeState(enabled);
  }, []);

  return (
    <DemoModeContext.Provider value={{ demoMode, hydrated, toggleDemoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return ctx;
}
