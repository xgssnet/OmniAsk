import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { normalizeSites } from '@/core/sites/siteConfig';
import { DEFAULT_DRAFT, DEFAULT_SETTINGS, STORAGE_KEYS } from '@/shared/settings';
import { BUILTIN_SITES } from '@/shared/sites';
import { readStorage, writeStorage } from '@/shared/storage';
import type { AppSettings, DraftState, SiteConfig } from '@/shared/types';

interface AppStateContextValue {
  ready: boolean;
  sites: SiteConfig[];
  settings: AppSettings;
  draft: DraftState;
  setQuestion: (question: string) => void;
  setSelectedSiteIds: (ids: string[]) => void;
  toggleSiteSelection: (id: string) => void;
  updateSite: (id: string, patch: Partial<SiteConfig>) => void;
  addSite: (site: SiteConfig) => void;
  removeSite: (id: string) => void;
  resetSites: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  saveDefaultSelection: () => void;
  resetDraft: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);
const SAVE_DELAY_MS = 250;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState<SiteConfig[]>(BUILTIN_SITES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<DraftState>(DEFAULT_DRAFT);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      readStorage(STORAGE_KEYS.sites, BUILTIN_SITES),
      readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
      readStorage(STORAGE_KEYS.draft, DEFAULT_DRAFT),
    ]).then(([savedSites, savedSettings, savedDraft]) => {
      if (!alive) return;
      setSites(normalizeSites(savedSites));
      setSettings({
        ...DEFAULT_SETTINGS,
        ...savedSettings,
        judge: { ...DEFAULT_SETTINGS.judge, ...savedSettings.judge },
      });
      setDraft({ ...DEFAULT_DRAFT, ...savedDraft });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void writeStorage(STORAGE_KEYS.sites, sites), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sites, ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void writeStorage(STORAGE_KEYS.settings, settings), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void writeStorage(STORAGE_KEYS.draft, draft), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, ready]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ready,
      sites,
      settings,
      draft,
      setQuestion: (question) => setDraft((current) => ({ ...current, question })),
      setSelectedSiteIds: (ids) => setDraft((current) => ({ ...current, selectedSiteIds: ids })),
      toggleSiteSelection: (id) =>
        setDraft((current) => ({
          ...current,
          selectedSiteIds: current.selectedSiteIds.includes(id)
            ? current.selectedSiteIds.filter((item) => item !== id)
            : [...current.selectedSiteIds, id],
        })),
      updateSite: (id, patch) =>
        setSites((current) => current.map((site) => (site.id === id ? { ...site, ...patch } : site))),
      addSite: (site) => setSites((current) => [...current, site]),
      removeSite: (id) => {
        setSites((current) => current.filter((site) => site.id !== id));
        setDraft((current) => ({
          ...current,
          selectedSiteIds: current.selectedSiteIds.filter((item) => item !== id),
        }));
        setSettings((current) => ({
          ...current,
          defaultSiteIds: current.defaultSiteIds.filter((item) => item !== id),
        }));
      },
      resetSites: () =>
        setSites((current) => [...BUILTIN_SITES, ...current.filter((site) => site.custom)]),
      updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
      saveDefaultSelection: () =>
        setSettings((current) => ({ ...current, defaultSiteIds: [...draft.selectedSiteIds] })),
      resetDraft: () => setDraft({ question: '', selectedSiteIds: [...settings.defaultSiteIds] }),
    }),
    [ready, sites, settings, draft],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState 必须在 AppStateProvider 内使用');
  return context;
}
