import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SchemeChoice } from '@/theme/theme';

export type Language = 'system' | 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt';

export const LANGUAGES: Language[] = ['system', 'it', 'en', 'es', 'fr', 'de', 'pt'];

interface SettingsState {
  hydrated: boolean;
  scheme: SchemeChoice;
  language: Language;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;

  hydrate: () => Promise<void>;
  setScheme: (scheme: SchemeChoice) => void;
  setLanguage: (language: Language) => void;
  setReminder: (enabled: boolean, hour: number, minute: number) => void;
}

const STORAGE_KEY = 'bootrack:settings:v2';

interface Persisted {
  scheme: SchemeChoice;
  language: Language;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

function persist(state: Persisted) {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  scheme: 'system',
  language: 'system',
  reminderEnabled: false,
  reminderHour: 20,
  reminderMinute: 0,

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
  },

  setLanguage: (language) => {
    set({ language });
    persist(snapshot(get, { language }));
  },

  setReminder: (reminderEnabled, reminderHour, reminderMinute) => {
    set({ reminderEnabled, reminderHour, reminderMinute });
    persist(snapshot(get, { reminderEnabled, reminderHour, reminderMinute }));
  },
}));

/** Build the full persisted snapshot from current state plus an override. */
function snapshot(get: () => SettingsState, override: Partial<Persisted>): Persisted {
  const s = get();
  return {
    scheme: s.scheme,
    language: s.language,
    reminderEnabled: s.reminderEnabled,
    reminderHour: s.reminderHour,
    reminderMinute: s.reminderMinute,
    ...override,
  };
}
