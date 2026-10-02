import { useCallback } from 'react';
import { getLocales } from 'expo-localization';
import type { DurationUnits } from '@/lib/utils';
import { Language, useSettings } from '@/store/useSettings';
import {
  dict,
  Lang,
  monthsLong,
  monthsShort,
  weekdayInitials,
  weekdaysShort,
} from './strings';
import { keepKoreanWords, langForLocale, pluralSuffix } from './core';

export type { Lang } from './strings';
export { langForLocale, pluralSuffix } from './core';
export { weekdaysShort, weekdayInitials, monthsLong } from './strings';

function deviceLang(): Lang {
  try {
    // Honour the whole preference list, not just the first entry: a device set
    // to e.g. [sv-SE, it-IT] should get Italian, not the English fallback.
    for (const locale of getLocales()) {
      const lang = langForLocale(locale.languageCode, locale.regionCode, locale.languageTag);
      if (lang) return lang;
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
  // `{key}One` / `{key}Many` entries, when present, are the plural variants for {n}.
  const suffix = params?.n !== undefined ? pluralSuffix(lang, params.n) : '';
  const variant = suffix ? dict[lang]?.[key + suffix] : undefined;
  let s = variant ?? dict[lang]?.[key] ?? dict.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return lang === 'ko' ? keepKoreanWords(s) : s;
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
    sep: wordSep(lang),
    num: lang === 'es' || lang === 'fr' || lang === 'de' || lang === 'pl' ? '\u00a0' : '',
  };
}

/** Space between a number and its unit or between words: none in Japanese
 *  and Chinese ("12冊", "2時間30分"). */
export function wordSep(lang: Lang): string {
  return lang === 'ja' || lang === 'zh-Hant' ? '' : ' ';
}

/** Space between a number and its unit or counter: none in Japanese and
 *  Korean ("25ページ", "25페이지"); Taiwanese Chinese spaces them ("25 頁"). */
export function numUnitSep(lang: Lang): string {
  return lang === 'ja' || lang === 'ko' ? '' : ' ';
}

/** "Label: value" with the language's colon ("Label : value" in French,
 *  "標籤：值" in Japanese/Chinese). */
export function labelValue(lang: Lang, label: string, value: string): string {
  if (lang === 'fr') return `${label} : ${value}`;
  if (lang === 'ja' || lang === 'zh-Hant') return `${label}：${value}`;
  return `${label}: ${value}`;
}

/** Group-separated integer in the app language (not the device locale). */
export function formatInt(n: number, lang: Lang): string {
  try {
    return n.toLocaleString(lang);
  } catch {
    return String(n);
  }
}

/** One decimal in the app language: "4,0" / "4.0". */
export function formatDecimal(n: number, lang: Lang): string {
  try {
    return n.toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  } catch {
    return n.toFixed(1);
  }
}

/** "2 ott 2026" / "2. Okt 2026" / "2026年10月2日"; without the year when
 *  `withYear` is false. */
export function formatDate(ts: number, lang: Lang, withYear = true): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  if (lang === 'ja' || lang === 'zh-Hant') return `${withYear ? `${y}年` : ''}${mo}月${day}日`;
  if (lang === 'ko') return `${withYear ? `${y}년 ` : ''}${mo}월 ${day}일`;
  // German writes the day as an ordinal: "2. Okt 2026".
  const s = `${day}${lang === 'de' ? '.' : ''} ${monthsShort[lang][mo - 1]}`;
  return withYear ? `${s} ${y}` : s;
}

export function localizedWeekdaysShort(lang: Lang): string[] {
  return weekdaysShort[lang];
}

export function localizedWeekdayInitials(lang: Lang): string[] {
  return weekdayInitials[lang];
}

/** Date for a local day key (YYYY-MM-DD) - never goes through UTC. */
export function formatDateKey(key: string, lang: Lang, withYear = true): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d, 12).getTime(), lang, withYear);
}

/** Month + year: "dicembre 2026" / "December 2026" / "diciembre de 2026" /
 *  "2026年12月". Mid-sentence (`title` false) month names are lower-case
 *  everywhere except in English and German; as a heading they're capitalised. */
export function monthYear(year: number, monthIndex: number, lang: Lang, title = false): string {
  if (lang === 'ja' || lang === 'zh-Hant') return `${year}年${monthIndex + 1}月`;
  if (lang === 'ko') return `${year}년 ${monthIndex + 1}월`;
  const name = monthsLong[lang][monthIndex];
  const of = lang === 'es' || lang === 'pt' || lang === 'pt-BR' ? ' de' : '';
  return `${title || lang === 'en' || lang === 'de' ? name : name.toLowerCase()}${of} ${year}`;
}

/** Month + year for a YYYY-MM(-DD) key, mid-sentence. */
export function formatMonthYear(key: string, lang: Lang): string {
  return monthYear(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, lang);
}
