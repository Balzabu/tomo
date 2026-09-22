import { useCallback } from 'react';
import { getLocales } from 'expo-localization';
import type { DurationUnits } from '@/lib/utils';
import { Language, useSettings } from '@/store/useSettings';
import {
  dict,
  Lang,
  monthsShort,
  weekdayInitials,
  weekdaysShort,
} from './strings';

export type { Lang } from './strings';
export { weekdaysShort, weekdayInitials } from './strings';

const SUPPORTED: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'pt'];

function deviceLang(): Lang {
  try {
    // Honour the whole preference list, not just the first entry: a device set
    // to e.g. [nl-NL, it-IT] should get Italian, not the English fallback.
    for (const locale of getLocales()) {
      const code = locale.languageCode;
      if (code && SUPPORTED.includes(code as Lang)) return code as Lang;
    }
    return 'en';
  } catch {
    return 'en';
  }
}

export function resolveLang(language: Language): Lang {
  return language === 'system' ? deviceLang() : language;
}

type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = dict[lang]?.[key] ?? dict.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export type TFunc = (key: string, params?: Params) => string;

export interface Translation {
  t: TFunc;
  lang: Lang;
}

/** Reactive translation hook - re-renders when the language setting changes. */
export function useTranslation(): Translation {
  const language = useSettings((s) => s.language);
  const lang = resolveLang(language);
  // Stable identity per language so effects/memos that depend on `t` don't
  // re-run on every render (e.g. the daily-reminder scheduler, library filter).
  const t = useCallback<TFunc>((key, params) => translate(lang, key, params), [lang]);
  return { t, lang };
}

/** Unit suffixes for formatDuration() in the given language. */
export function durationUnits(lang: Lang): DurationUnits {
  return {
    h: translate(lang, 'unit.hourAbbr'),
    m: translate(lang, 'unit.minAbbr'),
    s: translate(lang, 'unit.secAbbr'),
  };
}

/** Group-separated integer in the app language (not the device locale). */
export function formatInt(n: number, lang: Lang): string {
  try {
    return n.toLocaleString(lang);
  } catch {
    return String(n);
  }
}

export function formatDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  const m = monthsShort[lang][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function localizedWeekdaysShort(lang: Lang): string[] {
  return weekdaysShort[lang];
}

export function localizedWeekdayInitials(lang: Lang): string[] {
  return weekdayInitials[lang];
}
