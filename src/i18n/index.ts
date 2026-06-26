import { useCallback } from 'react';
import { getLocales } from 'expo-localization';
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
    const code = getLocales()[0]?.languageCode ?? 'en';
    return SUPPORTED.includes(code as Lang) ? (code as Lang) : 'en';
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

export function formatDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  const m = monthsShort[lang][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function formatDateShort(ts: number, lang: Lang): string {
  const d = new Date(ts);
  return `${d.getDate()} ${monthsShort[lang][d.getMonth()]}`;
}

export function localizedWeekdaysShort(lang: Lang): string[] {
  return weekdaysShort[lang];
}

export function localizedWeekdayInitials(lang: Lang): string[] {
  return weekdayInitials[lang];
}
