import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@/shared/settings';
import { readStorage, writeStorage } from '@/shared/storage';
import type { ThemeMode } from '@/shared/types';

interface ThemeContextValue {
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (next: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_SETTINGS.theme);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    void readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS).then((settings) => {
      setThemeState(settings.theme ?? DEFAULT_SETTINGS.theme);
    });

    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    void readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS).then((settings) =>
      writeStorage(STORAGE_KEYS.settings, { ...settings, theme: next }),
    );
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved,
      setTheme,
      toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [theme, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return context;
}
