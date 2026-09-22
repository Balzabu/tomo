import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SchemeChoice } from '@/theme/theme';
import { LIBRARY_SORTS, LibraryFilter, LibrarySort, ReadingStatus, STATUS_ORDER } from '@/types';

export type Language = 'system' | 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt';

export const LANGUAGES: Language[] = ['system', 'it', 'en', 'es', 'fr', 'de', 'pt'];

interface SettingsState {
  hydrated: boolean;
  scheme: SchemeChoice;
  language: Language;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  librarySort: LibrarySort;
  librarySortAsc: boolean;
  libraryFilter: LibraryFilter;

  hydrate: () => Promise<void>;
  setScheme: (scheme: SchemeChoice) => void;
  setLanguage: (language: Language) => void;
  setReminder: (enabled: boolean, hour: number, minute: number) => void;
  setLibraryView: (view: Partial<Pick<SettingsState, 'librarySort' | 'librarySortAsc' | 'libraryFilter'>>) => void;
}

const STORAGE_KEY = 'tomo:settings:v2';

interface Persisted {
  scheme: SchemeChoice;
  language: Language;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  librarySort?: LibrarySort;
  librarySortAsc?: boolean;
  libraryFilter?: LibraryFilter;
}

function sanitizeFilter(v: unknown): LibraryFilter {
  if (!v || typeof v !== 'object') return { kind: 'all' };
  const f = v as { kind?: unknown; status?: unknown; id?: unknown };
  if (f.kind === 'status' && STATUS_ORDER.includes(f.status as ReadingStatus)) {
    return { kind: 'status', status: f.status as ReadingStatus };
  }
  if (f.kind === 'shelf' && typeof f.id === 'string') return { kind: 'shelf', id: f.id };
  return { kind: 'all' };
}

function persist(state: Persisted) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
    console.warn('Failed to persist settings', e)
  );
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  scheme: 'system',
  language: 'system',
  reminderEnabled: false,
  reminderHour: 20,
  reminderMinute: 0,
  librarySort: 'recent',
  librarySortAsc: false,
  libraryFilter: { kind: 'all' },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        set({
          scheme: p.scheme ?? 'system',
          language: p.language ?? 'system',
          reminderEnabled: p.reminderEnabled ?? false,
          reminderHour: p.reminderHour ?? 20,
          reminderMinute: p.reminderMinute ?? 0,
          librarySort: LIBRARY_SORTS.includes(p.librarySort as LibrarySort) ? (p.librarySort as LibrarySort) : 'recent',
          librarySortAsc: p.librarySortAsc === true,
          libraryFilter: sanitizeFilter(p.libraryFilter),
          hydrated: true,
        });
        return;
      }
    } catch (e) {
      console.warn('Failed to load settings', e);
    }
    set({ hydrated: true });
  },

  setScheme: (scheme) => {
    set({ scheme });
    persist(snapshot(get, { scheme }));
    refreshPlacedWidgets();
  },

  setLanguage: (language) => {
    set({ language });
    persist(snapshot(get, { language }));
    refreshPlacedWidgets();
  },

  setReminder: (reminderEnabled, reminderHour, reminderMinute) => {
    set({ reminderEnabled, reminderHour, reminderMinute });
    persist(snapshot(get, { reminderEnabled, reminderHour, reminderMinute }));
  },

  setLibraryView: (view) => {
    set(view);
    persist(snapshot(get, view));
  },
}));

// Widgets render with the persisted theme/language, so a change here must
// re-render them immediately - otherwise they stay wrong until the next data
// mutation or 30-minute periodic update. Lazy require: a static import would
// create a cycle (widgets → i18n → this store).
function refreshPlacedWidgets(): void {
  try {
    const { refreshWidgets } = require('@/widgets/refresh') as typeof import('@/widgets/refresh');
    void refreshWidgets();
  } catch {
    // best-effort, like every other widget refresh
  }
}

/** Build the full persisted snapshot from current state plus an override. */
function snapshot(get: () => SettingsState, override: Partial<Persisted>): Persisted {
  const s = get();
  return {
    scheme: s.scheme,
    language: s.language,
    reminderEnabled: s.reminderEnabled,
    reminderHour: s.reminderHour,
    reminderMinute: s.reminderMinute,
    librarySort: s.librarySort,
    librarySortAsc: s.librarySortAsc,
    libraryFilter: s.libraryFilter,
    ...override,
  };
}
