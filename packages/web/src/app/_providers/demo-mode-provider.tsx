'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

interface DemoModeContextValue {
  demoMode: boolean;
  toggleDemoMode: () => void;
  setDemoMode: (enabled: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'qod-demo-mode';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevDemoMode = useRef<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setDemoModeState(true);
    }
    // If nothing stored, default to false (require login)
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(demoMode));

    // Navigate to home when demo mode is toggled (not on initial load)
    if (prevDemoMode.current !== null && prevDemoMode.current !== demoMode) {
      router.push('/');
    }
    prevDemoMode.current = demoMode;
  }, [demoMode, mounted, router]);

  const toggleDemoMode = useCallback(() => {
    setDemoModeState((prev) => !prev);
  }, []);

  const setDemoMode = useCallback((enabled: boolean) => {
    setDemoModeState(enabled);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <DemoModeContext.Provider value={{ demoMode, toggleDemoMode, setDemoMode }}>
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
