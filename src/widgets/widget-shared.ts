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
  /** Set when the scheme follows the system: the widgets then ship both
   *  variants and Android swaps them on its own when night mode toggles,
   *  instead of keeping the colours of whenever they were last rendered. */
  systemThemes?: { light: Theme; dark: Theme };
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
  // Read-only: this runs in the widgets' own JS runtime, which must never
  // migrate/write over data the app may have changed since.
  const data = preloaded ?? (await loadData({ readOnly: true }));

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
  const systemThemes =
    scheme === 'system'
      ? { light: resolveScheme('system', 'light'), dark: resolveScheme('system', 'dark') }
      : undefined;
  return { data, theme, systemThemes, t, lang };
}

/** Cast a runtime hex string to the widget ColorProp type. */
export function hx(color: string): `#${string}` {
  return color as `#${string}`;
}

/** #RRGGBBAA colour from a #RRGGBB base + alpha 0..1. The widget library
 *  takes CSS-style 8-digit hex (alpha last) and converts it to Android's
 *  #AARRGGBB itself - passing #AARRGGBB here scrambles the channels. */
export function withAlpha(hexColor: string, alpha: number): `#${string}` {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hexColor.replace('#', '').slice(0, 6)}${a}` as `#${string}`;
}

/** Size of a placed widget in dp, as reported by the launcher. */
export interface WidgetSize {
  width: number;
  height: number;
}

/** A size is 0x0 when the launcher hasn't reported one yet (e.g. right after
 *  placement on some launchers) - fall back to the widget's default cell size. */
export function sizeOr(size: WidgetSize | undefined, fallback: WidgetSize): WidgetSize {
  if (!size || size.width <= 0 || size.height <= 0) return fallback;
  return size;
}

// Shared visual language of the home-screen widgets.
/** Close to the corner radius Android 12+ launchers use for widgets. */
export const WIDGET_RADIUS = 24;
/** Outer padding of every widget. */
export const WIDGET_PAD = 14;
/** Icon font bundled into android/app/src/main/assets/fonts (see app.json). */
export const ICON_FONT = 'Ionicons';

/** Ionicons glyphs used by the widgets (same icon set as the app). */
export const ICON = {
  play: '\uf4c6',
  swap: '\uf5b0',
  flame: '\uf313',
  book: '\uf1a6',
  add: '\uf103',
  calendar: '\uf1d6',
  time: '\uf5de',
  trophy: '\uf602',
  checkmark: '\uf21d',
  chevron: '\uf23b',
} as const;

/** Build a deep link the widgets open via clickAction OPEN_URI. */
export function link(path = ''): string {
  return `${SCHEME}:///${path}`;
}

// Remote covers (Google Books / Open Library URLs) are cached as files for
// the widgets: the native renderer otherwise downloads every cover again,
// synchronously, on every render - the main cost of the first frame after a
// widget is placed. A cover that isn't cached yet is handed over as its URL,
// exactly as before the cache existed, so a slow or failed download can never
// cost the widget its cover; the download finishing in the background serves
// every later render.
const WIDGET_COVER_DIR = `${FileSystem.cacheDirectory}widget-covers/`;
/** How long a render waits for a download before falling back to the URL. */
const COVER_DOWNLOAD_WAIT_MS = 1500;
const inflight = new Map<string, Promise<string | undefined>>();

function hashUrl(url: string): string {
  // djb2 - only needs to be stable and spread, not cryptographic.
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + url.length.toString(36);
}

function downloadCover(url: string, file: string): Promise<string | undefined> {
  let job = inflight.get(url);
  if (!job) {
    job = (async () => {
      const tmp = `${file}.part`;
      try {
        await FileSystem.makeDirectoryAsync(WIDGET_COVER_DIR, { intermediates: true }).catch(() => {});
        // Download next to the final name and move it into place, so a
        // half-written file is never picked up as a cached cover.
        const res = await FileSystem.downloadAsync(url, tmp);
        const info = await FileSystem.getInfoAsync(tmp);
        if (res.status !== 200 || !info.exists || info.size === 0) {
          await FileSystem.deleteAsync(tmp, { idempotent: true });
          return undefined;
        }
        await FileSystem.moveAsync({ from: tmp, to: file });
        return file;
      } catch {
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
        return undefined;
      } finally {
        inflight.delete(url);
      }
    })();
    inflight.set(url, job);
  }
  return job;
}

/** The cached file for a remote cover, or the URL itself when it isn't
 *  cached (yet): the native renderer then fetches it as it always did. */
async function cachedRemoteCover(url: string): Promise<string> {
  const file = `${WIDGET_COVER_DIR}${hashUrl(url)}.img`;
  try {
    if ((await FileSystem.getInfoAsync(file)).exists) return file;
  } catch {
    return url;
  }
  const done = await Promise.race([
    downloadCover(url, file),
    new Promise<undefined>((r) => setTimeout(() => r(undefined), COVER_DOWNLOAD_WAIT_MS)),
  ]);
  return done ?? url;
}

/** Convert a cover url into something ImageWidget accepts. Local covers are
 *  handed over as file:// URIs - the native renderer decodes those directly
 *  (ResourceUtils.getBitmap), so no multi-MB base64 string has to be read,
 *  encoded and pushed across the bridge on every single widget refresh.
 *  Remote covers go through a file cache (see cachedRemoteCover). */
export async function coverToWidgetImage(
  coverUrl?: string
): Promise<ImageWidgetSource | undefined> {
  if (!coverUrl) return undefined;
  if (coverUrl.startsWith('http:') || coverUrl.startsWith('https:')) {
    // No cache dir (never expected on Android): let the renderer fetch it.
    if (!FileSystem.cacheDirectory) return coverUrl as ImageWidgetSource;
    return (await cachedRemoteCover(coverUrl)) as ImageWidgetSource;
  }
  if (coverUrl.startsWith('data:image') || coverUrl.startsWith('file:')) {
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

/** Books you haven't finished (reading, to-read, paused): reading first, and
 *  within a status the most recently read (then most recently added) first,
 *  so the book you picked up last night is the one at the top. */
export function unfinishedBooks(data: AppData, limit = 3): Book[] {
  const rank: Record<string, number> = { reading: 0, paused: 1, want_to_read: 2 };
  const lastRead = new Map<string, number>();
  for (const s of data.sessions) {
    if (s.endTime > (lastRead.get(s.bookId) ?? 0)) lastRead.set(s.bookId, s.endTime);
  }
  return data.books
    .filter((b) => b.status === 'reading' || b.status === 'paused' || b.status === 'want_to_read')
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (lastRead.get(b.id) ?? 0) - (lastRead.get(a.id) ?? 0) ||
        b.addedAt - a.addedAt
    )
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
