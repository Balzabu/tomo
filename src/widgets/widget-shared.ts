import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { AppData, Book } from '@/types';
import { loadData } from '@/lib/storage';
import { migrateLegacyKeys } from '@/lib/migrate';
import { resolveScheme, SchemeChoice, Theme } from '@/theme/theme';
import { Language } from '@/store/useSettings';
import { Lang, resolveLang, translate } from '@/i18n';
import { toDateKey } from '@/lib/utils';

const SETTINGS_KEY = 'tomo:settings:v2';
const SCHEME = 'tomo';

export type WidgetT = (key: string, params?: Record<string, string | number>) => string;

export interface WidgetContext {
  data: AppData;
  theme: Theme;
  t: WidgetT;
  lang: Lang;
}

/**
 * Read app data + settings from storage (works in the headless widget task).
 * Pass `preloaded` (the in-memory AppData) to skip the disk re-read when the
 * foreground store already holds fresh data.
 */
export async function loadWidgetContext(preloaded?: AppData): Promise<WidgetContext> {
  // Headless widget updates can run before the app is first opened after the
  // update, so migrate the legacy storage keys here too (idempotent, no-op once
  // done). When `preloaded` is passed, the app already migrated.
  if (!preloaded) await migrateLegacyKeys();
  const data = preloaded ?? (await loadData());

  let scheme: SchemeChoice = 'system';
  let language: Language = 'system';
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { scheme?: SchemeChoice; language?: Language };
      scheme = p.scheme ?? 'system';
      language = p.language ?? 'system';
    }
  } catch {
    // defaults
  }

  const sys = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  const theme = resolveScheme(scheme, sys);
  const lang = resolveLang(language);
  const t: WidgetT = (key, params) => translate(lang, key, params);
  return { data, theme, t, lang };
}

/** Cast a runtime hex string to the widget ColorProp type. */
export function hx(color: string): `#${string}` {
  return color as `#${string}`;
}

/** Android #AARRGGBB colour from a #RRGGBB base + alpha 0..1. */
export function withAlpha(hexColor: string, alpha: number): `#${string}` {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${a}${hexColor.replace('#', '')}` as `#${string}`;
}

/** Build a deep link the widgets open via clickAction OPEN_URI. */
export function link(path = ''): string {
  return `${SCHEME}:///${path}`;
}

/** Convert a cover url into something ImageWidget accepts. Local covers are
 *  handed over as file:// URIs - the native renderer decodes those directly
 *  (ResourceUtils.getBitmap), so no multi-MB base64 string has to be read,
 *  encoded and pushed across the bridge on every single widget refresh. */
export async function coverToWidgetImage(
  coverUrl?: string
): Promise<ImageWidgetSource | undefined> {
  if (!coverUrl) return undefined;
  if (
    coverUrl.startsWith('http:') ||
    coverUrl.startsWith('https:') ||
    coverUrl.startsWith('data:image') ||
    coverUrl.startsWith('file:')
  ) {
    return coverUrl as ImageWidgetSource;
  }
  // Unknown scheme (defensive): fall back to embedding as a data-uri.
  try {
    const b64 = await FileSystem.readAsStringAsync(coverUrl, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}` as ImageWidgetSource;
  } catch {
    return undefined;
  }
}

// data selectors

export function progressPct(book: Book): number {
  if (book.status === 'finished') return 100;
  if (!book.pageCount || book.pageCount <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((book.currentPage / book.pageCount) * 100)));
}

/** All currently-reading books, ordered by most accumulated reading time. */
export function readingBooks(data: AppData): Book[] {
  const reading = data.books.filter((b) => b.status === 'reading');
  if (reading.length === 0) return [];
  const timeByBook = new Map<string, number>();
  for (const s of data.sessions) {
    timeByBook.set(s.bookId, (timeByBook.get(s.bookId) ?? 0) + s.durationSeconds);
  }
  return [...reading].sort(
    (a, b) =>
      (timeByBook.get(b.id) ?? 0) - (timeByBook.get(a.id) ?? 0) || b.addedAt - a.addedAt
  );
}

/** Currently-reading book with the most accumulated reading time. */
export function mostReadBook(data: AppData): Book | undefined {
  return readingBooks(data)[0];
}

export function bookTotalSeconds(data: AppData, bookId: string): number {
  return data.sessions
    .filter((s) => s.bookId === bookId)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
}

/** Books you haven't finished (reading, to-read, paused), reading first. */
export function unfinishedBooks(data: AppData, limit = 3): Book[] {
  const rank: Record<string, number> = { reading: 0, paused: 1, want_to_read: 2 };
  return data.books
    .filter((b) => b.status === 'reading' || b.status === 'paused' || b.status === 'want_to_read')
    .sort((a, b) => (rank[a.status] - rank[b.status]) || b.addedAt - a.addedAt)
    .slice(0, limit);
}

export function todaySeconds(data: AppData): number {
  const today = toDateKey();
  return data.sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
}

export function todayPages(data: AppData): number {
  const today = toDateKey();
  return data.sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + (s.pagesRead || 0), 0);
}
