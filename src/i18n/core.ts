// Pure language rules (no React Native imports, so scripts/check can test them).
import { LANGS, type Lang } from './strings.ts';

/** App language for one device locale, or null when Tomo doesn't speak it.
 *  Portuguese and Chinese depend on the region/script, not just the language:
 *  Brazil gets pt-BR, Traditional Chinese (TW/HK/MO) gets zh-Hant, and
 *  Simplified Chinese isn't offered. */
export function langForLocale(code: string | null | undefined, region?: string | null, tag?: string | null): Lang | null {
  if (!code) return null;
  if (code === 'pt') return region === 'BR' ? 'pt-BR' : 'pt';
  if (code === 'zh') {
    const traditional = /-Hant\b/i.test(tag ?? '') || ['TW', 'HK', 'MO'].includes(region ?? '');
    return traditional && !/-Hans\b/i.test(tag ?? '') ? 'zh-Hant' : null;
  }
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : null;
}

/** The integer a count param stands for ("1", 12, "4.932", "4 932"), or null
 *  for a decimal ("1,9") or anything else. */
function countValue(n: string | number): number | null {
  if (typeof n === 'number') return Number.isInteger(n) ? n : null;
  const v = n.replace(/[\s\u00a0\u202f]/g, '');
  if (/^\d+$/.test(v)) return Number(v);
  if (/^\d{1,3}([.,'’]\d{3})+$/.test(v)) return Number(v.replace(/\D/g, ''));
  return null;
}

const NO_PLURALS: readonly Lang[] = ['ja', 'ko', 'zh-Hant'];

/** Key suffix of the plural variant for n: '' (base), 'One' or 'Many'.
 *  Polish base strings hold the "few" form (2-4 książki, also decimals) and
 *  `Many` the "many" one (0, 5-21… książek). */
export function pluralSuffix(lang: Lang, n: string | number): '' | 'One' | 'Many' {
  if (NO_PLURALS.includes(lang)) return '';
  const i = countValue(n);
  if (i === null) return '';
  // French also says "0 livre": zero takes the singular.
  if (i === 1 || (i === 0 && lang === 'fr')) return 'One';
  if (lang === 'pl') {
    const d = i % 10;
    const dd = i % 100;
    return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? '' : 'Many';
  }
  return '';
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
export const WORD_JOINER = '⁠';

/** Korean breaks lines only between words (at spaces), but Android breaks
 *  Hangul text between any two syllables ("잠/금을"). An invisible WORD JOINER
 *  between the characters of each word forbids those breaks. */
export function keepKoreanWords(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    out += c;
    if (n !== undefined && c !== WORD_JOINER && n !== WORD_JOINER && !/\s/.test(c) && !/\s/.test(n) && (HANGUL.test(c) || HANGUL.test(n))) {
      out += WORD_JOINER;
    }
  }
  return out;
}
