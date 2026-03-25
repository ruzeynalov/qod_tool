'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';
export type Skin = 'classic' | 'modern';

interface ThemeContextValue {
  theme: Theme;
  skin: Skin;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setSkin: (skin: Skin) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = 'qod-theme';
const SKIN_KEY = 'qod-skin';

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
}

function applySkinClass(skin: Skin) {
  const root = document.documentElement;
  root.classList.remove('skin-modern');
  if (skin === 'modern') {
    root.classList.add('skin-modern');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [skin, setSkinState] = useState<Skin>('modern');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    const storedSkin = localStorage.getItem(SKIN_KEY) as Skin | null;

    const t = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'light';
    const s = storedSkin === 'classic' ? 'classic' : 'modern';

    setThemeState(t);
    setSkinState(s);
    applyThemeClass(t);
    applySkinClass(s);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyThemeClass(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    applySkinClass(skin);
    localStorage.setItem(SKIN_KEY, skin);
  }, [skin, mounted]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const setSkin = useCallback((s: Skin) => {
    setSkinState(s);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, skin, toggleTheme, setTheme, setSkin }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
