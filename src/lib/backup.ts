import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { AppData, Book, BookNote, Goal, NoteType, ReadingSession, ReadingStatus, Shelf, Tombstone } from '@/types';
import { emptyData } from '@/lib/storage';
import { toDateKey } from '@/lib/utils';
import { readingDayKey } from '@/lib/readingDay';
import { base64ToCover, coverToBase64, isLocalCover, safeCoverUrl } from '@/lib/covers';
import { keepIsbn } from '@/lib/isbn';
import { sanitizeReads } from '@/lib/reads';
import { toGoodreadsCsv } from '@/lib/csvExport';
import { normalizeGoal } from '@/lib/goals';
import { withLockGrace } from '@/store/useLock';
import { pruneTombstones } from '@/lib/sync';

// Import sanitisation: never trust a hand-edited backup file.

const VALID_STATUS: ReadingStatus[] = ['want_to_read', 'reading', 'finished', 'paused', 'dnf'];
const VALID_SOURCES: Book['source'][] = ['google', 'openlibrary', 'manual', 'import'];

// Length caps: far beyond any real value, but a hand-made file can't blow a
// single record up to where it no longer fits a storage row (or the UI).
const MAX_TEXT = 50_000; // descriptions, reviews, note text
const MAX_SHORT = 1_000; // titles, names, ids and other one-liners
const MAX_LIST = 50; // authors, categories, moods, shelves of a book
const MAX_READS = 1_000;

/** Cut a string to at most `max` chars without splitting a surrogate pair. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const code = s.charCodeAt(max - 1);
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

function asString(v: unknown, fallback = '', max = MAX_SHORT): string {
  return typeof v === 'string' ? clip(v, max) : fallback;
}
function asOptionalString(v: unknown, max = MAX_SHORT): string | undefined {
  return typeof v === 'string' ? clip(v, max) : undefined;
}
/** An id: kept whole (a clipped id could collide with another), or rejected. */
function asId(v: unknown): string {
  return typeof v === 'string' && v.length <= MAX_SHORT ? v : '';
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function asOptionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
/** A plausible timestamp: 1900 to a day from now. Anything else (a typo,
 *  a hostile file, a phone with a wrong clock) is dropped - a date from the
 *  future would otherwise win every merge forever. */
const MIN_TS = -2208988800000;
function asTime(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_TS && v <= Date.now() + 86_400_000 ? v : undefined;
}

function asStringArray(v: unknown, max = MAX_LIST): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => clip(x, MAX_SHORT))
    : [];
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
function sanitizePlan(v: unknown): Book['plan'] {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  if (typeof p.target !== 'string' || !DAY_KEY.test(p.target)) return undefined;
  if (typeof p.start !== 'string' || !DAY_KEY.test(p.start)) return undefined;
  return { target: p.target, start: p.start, startPage: Math.max(0, asNumber(p.startPage)) };
}

/** Coerce an untrusted object into a valid Book, or drop it (null) if unusable. */
function sanitizeBook(raw: unknown): Book | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asId(r.id);
  const title = asString(r.title);
  if (!id || !title) return null;
  const pageCount =
    typeof r.pageCount === 'number' && Number.isFinite(r.pageCount) && r.pageCount > 0
      ? Math.floor(r.pageCount)
      : undefined;
  const currentPage = Math.max(0, asNumber(r.currentPage));
  const rating =
    typeof r.rating === 'number' && Number.isFinite(r.rating)
      ? Math.max(0, Math.min(5, r.rating))
      : undefined;
  // Build the book from validated fields only - spreading the raw object would
  // let any unchecked field through with any JSON type (e.g. a numeric
  // coverUrl, which breaks isLocalCover on every future export, or an object
  // review that crashes the <Text> rendering it).
  return {
    id,
    title,
    authors: asStringArray(r.authors),
    // Only https or our own cover files; embedded covers are re-created
    // from _covers below with fresh file names anyway.
    coverUrl: safeCoverUrl(r.coverUrl),
    isbn: keepIsbn(asOptionalString(r.isbn)),
    pageCount,
    description: asOptionalString(r.description, MAX_TEXT),
    publisher: asOptionalString(r.publisher),
    publishedDate: asOptionalString(r.publishedDate),
    categories: Array.isArray(r.categories) ? asStringArray(r.categories) : undefined,
    language: asOptionalString(r.language),
    status: VALID_STATUS.includes(r.status as ReadingStatus)
      ? (r.status as ReadingStatus)
      : 'want_to_read',
    // clamp progress into the valid range and coerce the untrusted date/rating
    // fields so a hand-edited backup can't poison stats with NaN/strings.
    currentPage: pageCount ? Math.min(currentPage, pageCount) : currentPage,
    rating,
    review: asOptionalString(r.review, MAX_TEXT),
    series: asOptionalString(r.series),
    seriesNumber: asOptionalNumber(r.seriesNumber),
    moods: Array.isArray(r.moods) ? asStringArray(r.moods) : undefined,
    pace: r.pace === 'slow' || r.pace === 'medium' || r.pace === 'fast' ? r.pace : undefined,
    addedAt: asTime(r.addedAt) ?? Date.now(),
    startedAt: asTime(r.startedAt),
    finishedAt: asTime(r.finishedAt),
    readCount:
      typeof r.readCount === 'number' && Number.isFinite(r.readCount)
        ? Math.max(0, Math.floor(r.readCount))
        : undefined,
    // newest cycles if a file claims an absurd history
    reads: sanitizeReads(r.reads)?.slice(-MAX_READS),
    // an open reread cycle (see finishFields) - anything else means no
    rereading: r.rereading === true ? true : undefined,
    shelfIds: asStringArray(r.shelfIds),
    catalogCheckedIsbn: asOptionalString(r.catalogCheckedIsbn),
    plan: sanitizePlan(r.plan),
    updatedAt: asTime(r.updatedAt),
    source: VALID_SOURCES.includes(r.source as Book['source'])
      ? (r.source as Book['source'])
      : 'manual',
  };
}

function sanitizeSession(raw: unknown): ReadingSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bookId = asId(r.bookId);
  const id = asId(r.id);
  if (!bookId || !id) return null;
  const startTime = asTime(r.startTime) ?? 0;
  // The day key drives streaks, goals and the heatmap. Falling back to *today*
  // would credit every restored session to the restore date, so derive it from
  // startTime instead - and drop the session when neither is usable.
  const rawDate = asString(r.date);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : startTime > 0
    ? readingDayKey(startTime)
    : null;
  if (!date) return null;
  // Validated fields only - see sanitizeBook for why the raw spread is unsafe.
  return {
    id,
    bookId,
    startTime,
    endTime: asTime(r.endTime) ?? startTime,
    durationSeconds: Math.min(86_400, Math.max(0, asNumber(r.durationSeconds))),
    startPage: asOptionalNumber(r.startPage),
    endPage: asOptionalNumber(r.endPage),
    pagesRead: Math.max(0, asNumber(r.pagesRead)),
    note: asOptionalString(r.note, MAX_TEXT),
    date,
    updatedAt: asTime(r.updatedAt),
  };
}

function sanitizeShelf(raw: unknown): Shelf | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asId(r.id);
  const name = asString(r.name);
  if (!id || !name) return null;
  // Validated fields only - see sanitizeBook for why the raw spread is unsafe.
  return {
    id,
    name,
    color: asString(r.color, '#7c5cff'),
    icon: asOptionalString(r.icon),
    emoji: asOptionalString(r.emoji),
    createdAt: asTime(r.createdAt) ?? Date.now(),
    updatedAt: asTime(r.updatedAt),
  };
}

function sanitizeTombstone(raw: unknown): Tombstone | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asId(r.id);
  const deletedAt = asTime(r.deletedAt);
  if (!id || deletedAt == null) return null;
  const keys = asStringArray(r.keys).slice(0, 4);
  return keys.length ? { id, deletedAt, keys } : { id, deletedAt };
}

const VALID_NOTE_TYPES: NoteType[] = ['note', 'quote'];
function sanitizeNote(raw: unknown): BookNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asId(r.id);
  const bookId = asId(r.bookId);
  if (!id || !bookId) return null;
  return {
    id,
    bookId,
    type: VALID_NOTE_TYPES.includes(r.type as NoteType) ? (r.type as NoteType) : 'note',
    text: asString(r.text, '', MAX_TEXT),
    page: typeof r.page === 'number' && Number.isFinite(r.page) ? Math.floor(r.page) : undefined,
    createdAt: asTime(r.createdAt) ?? Date.now(),
    updatedAt: asTime(r.updatedAt),
  };
}

// Duplicated ids in a hand-merged backup would make patches/deletes hit every
// copy (and break React list keys) - keep the first occurrence only.
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

// Thrown when the picked file isn't a valid backup. The UI layer maps this
// code to a localized message (backup.ts stays free of user-facing strings).
export const INVALID_BACKUP = 'INVALID_BACKUP';

// Guard against reading a pathologically large file into memory / JSON.parse.
// A real backup with embedded covers can be tens of MB; this only rejects the
// absurd (a mistakenly-picked video, a malicious multi-GB file).
const MAX_BACKUP_BYTES = 128 * 1024 * 1024;

// Backup file = AppData plus base64 of locally-stored custom covers, keyed by
// book id. Remote (http) covers stay as URLs and aren't embedded.
interface BackupFile extends AppData {
  _covers?: Record<string, string>;
}

// The previous backup is deleted on the *next* export rather than as soon as
// the share sheet resolves: on Android the receiving app (Drive, Gmail) may
// still be reading the URI at that point, and an immediate delete hands it a
// missing file. Same pattern as shareImage.ts.
let lastBackupUri: string | null = null;

const COVER_READ_BATCH = 6;

/** The backup file's text: the app data plus base64 of local covers. */
export async function buildBackupJson(data: AppData): Promise<string> {
  const covers: Record<string, string> = {};
  // Each read is a native round trip: overlap a few at a time (bounded, so a
  // library full of custom covers doesn't hold them all in flight at once).
  // Results are assigned in library order, so the file is the same as before.
  const local = data.books.filter((b) => isLocalCover(b.coverUrl));
  for (let i = 0; i < local.length; i += COVER_READ_BATCH) {
    const batch = local.slice(i, i + COVER_READ_BATCH);
    const read = await Promise.all(batch.map((b) => coverToBase64(b.coverUrl as string)));
    batch.forEach((b, j) => {
      const base64 = read[j];
      if (base64) covers[b.id] = base64;
    });
  }
  const payload: BackupFile = { ...data, _covers: covers };
  // No pretty-print: a backup with many embedded covers is already large, and
  // indentation roughly doubles the in-memory string for no user benefit.
  return JSON.stringify(payload);
}

/** Write the full app data (with embedded local covers) and open the share sheet. */
export async function exportData(data: AppData, dialogTitle: string): Promise<boolean> {
  if (lastBackupUri) {
    await FileSystem.deleteAsync(lastBackupUri, { idempotent: true }).catch(() => {});
    lastBackupUri = null;
  }
  const json = await buildBackupJson(data);
  const fileUri = `${FileSystem.cacheDirectory}tomo-backup-${toDateKey()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  lastBackupUri = fileUri;
  if (await Sharing.isAvailableAsync()) {
    await withLockGrace(() => Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle,
      UTI: 'public.json',
    }));
    return true;
  }
  return false;
}

let lastCsvUri: string | null = null;

/** Write the library as a Goodreads-style CSV and open the share sheet. */
export async function exportCsv(data: AppData, dialogTitle: string): Promise<boolean> {
  if (lastCsvUri) {
    await FileSystem.deleteAsync(lastCsvUri, { idempotent: true }).catch(() => {});
    lastCsvUri = null;
  }
  const fileUri = `${FileSystem.cacheDirectory}tomo-library-${toDateKey()}.csv`;
  // BOM so Excel/Numbers open accented titles correctly; our own parser
  // trims it away.
  await FileSystem.writeAsStringAsync(fileUri, `\uFEFF${toGoodreadsCsv(data)}`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  lastCsvUri = fileUri;
  if (await Sharing.isAvailableAsync()) {
    await withLockGrace(() => Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle, UTI: 'public.comma-separated-values-text' }));
    return true;
  }
  return false;
}

/** Let the user pick a JSON backup file, parse it, and restore embedded covers. */
export async function importData(): Promise<AppData | null> {
  // Android's MediaStore often records .json files received via messaging or
  // downloads as application/octet-stream; a strict filter would grey out the
  // user's own backup. The parse/sanitize layer below rejects anything else.
  const res = await withLockGrace(() => DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  }));
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  // SAF content URIs can report no size - stat the copied cache file instead
  // of skipping the guard entirely.
  let size = asset.size;
  if (size == null) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    size = info.exists ? info.size : undefined;
  }
  if (size != null && size > MAX_BACKUP_BYTES) {
    throw new Error(INVALID_BACKUP);
  }
  const content = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return parseBackup(content);
}

/** Parse and sanitise a backup file's text, restoring embedded covers to
 *  local files. Throws INVALID_BACKUP when it isn't one. */
export async function parseBackup(content: string): Promise<AppData> {
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(content) as Partial<BackupFile>;
  } catch {
    throw new Error(INVALID_BACKUP);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.books)) {
    throw new Error(INVALID_BACKUP);
  }

  const books = dedupeById(parsed.books.map(sanitizeBook).filter((b): b is Book => b !== null));
  // A "backup" that restores zero books would silently wipe the whole library
  // (replaceAll deletes the current data and covers). Treat it as invalid.
  if (books.length === 0) throw new Error(INVALID_BACKUP);
  const bookIds = new Set(books.map((b) => b.id));
  const shelves = dedupeById(
    (Array.isArray(parsed.shelves) ? parsed.shelves : [])
      .map(sanitizeShelf)
      .filter((s): s is Shelf => s !== null)
  );
  const shelfIds = new Set(shelves.map((s) => s.id));

  const result: AppData = {
    ...emptyData,
    books: books.map((b) => ({ ...b, shelfIds: b.shelfIds.filter((id) => shelfIds.has(id)) })),
    // drop sessions/notes that reference a book not present in the backup
    sessions: dedupeById(
      (Array.isArray(parsed.sessions) ? parsed.sessions : [])
        .map(sanitizeSession)
        .filter((s): s is ReadingSession => s !== null && bookIds.has(s.bookId))
    ),
    notes: dedupeById(
      (Array.isArray(parsed.notes) ? parsed.notes : [])
        .map(sanitizeNote)
        .filter((n): n is BookNote => n !== null && bookIds.has(n.bookId))
    ),
    shelves,
    goals: dedupeById(
      (Array.isArray(parsed.goals) ? parsed.goals : [])
        .map(normalizeGoal)
        .filter((g): g is Goal => g !== null && g.id.length <= MAX_SHORT)
        .map((g) => (g.name ? { ...g, name: clip(g.name, MAX_SHORT) } : g))
    ),
    // Same expiry and cap the app applies to its own tombstones: a file can't
    // hand the library an unbounded list that every later change rescans.
    deleted: pruneTombstones(
      (Array.isArray(parsed.deleted) ? parsed.deleted : [])
        .map(sanitizeTombstone)
        .filter((t): t is Tombstone => t !== null),
      Date.now()
    ),
    version:
      typeof parsed.version === 'number' && Number.isFinite(parsed.version) ? parsed.version : emptyData.version,
  };

  // Restore embedded covers to fresh local files on this device.
  const embedded = parsed._covers ?? {};
  for (const book of result.books) {
    const base64 = embedded[book.id];
    if (base64) {
      try {
        book.coverUrl = await base64ToCover(base64);
      } catch {
        // keep whatever coverUrl was there if writing fails
      }
    }
  }

  return result;
}
