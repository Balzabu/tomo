import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { AppData, Book, BookNote, Goal, GoalType, NoteType, ReadingSession, ReadingStatus, Shelf } from '@/types';
import { emptyData } from '@/lib/storage';
import { toDateKey } from '@/lib/utils';
import { base64ToCover, coverToBase64, isLocalCover } from '@/lib/covers';

// Import sanitisation: never trust a hand-edited backup file.

const VALID_STATUS: ReadingStatus[] = ['want_to_read', 'reading', 'finished', 'paused', 'dnf'];

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Coerce an untrusted object into a valid Book, or drop it (null) if unusable. */
function sanitizeBook(raw: unknown): Book | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const title = asString(r.title);
  if (!id || !title) return null;
  const pageCount =
    typeof r.pageCount === 'number' && r.pageCount > 0 ? Math.floor(r.pageCount) : undefined;
  return {
    ...(r as object),
    id,
    title,
    authors: asStringArray(r.authors),
    status: VALID_STATUS.includes(r.status as ReadingStatus)
      ? (r.status as ReadingStatus)
      : 'want_to_read',
    currentPage: Math.max(0, asNumber(r.currentPage)),
    pageCount,
    addedAt: asNumber(r.addedAt, Date.now()),
    shelfIds: asStringArray(r.shelfIds),
    source: (r.source as Book['source']) ?? 'manual',
  } as Book;
}

function sanitizeSession(raw: unknown): ReadingSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bookId = asString(r.bookId);
  const id = asString(r.id);
  if (!bookId || !id) return null;
  return {
    ...(r as object),
    id,
    bookId,
    startTime: asNumber(r.startTime),
    endTime: asNumber(r.endTime),
    durationSeconds: Math.max(0, asNumber(r.durationSeconds)),
    pagesRead: Math.max(0, asNumber(r.pagesRead)),
    date: asString(r.date, toDateKey()),
  } as ReadingSession;
}

function sanitizeShelf(raw: unknown): Shelf | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const name = asString(r.name);
  if (!id || !name) return null;
  return {
    ...(r as object),
    id,
    name,
    color: asString(r.color, '#7c5cff'),
  } as Shelf;
}

const VALID_GOAL_TYPES: GoalType[] = ['books_per_year', 'pages_per_day', 'minutes_per_day'];
function sanitizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id || !VALID_GOAL_TYPES.includes(r.type as GoalType)) return null;
  return {
    id,
    type: r.type as GoalType,
    target: Math.max(0, asNumber(r.target)),
    year: asNumber(r.year, new Date().getFullYear()),
    createdAt: asNumber(r.createdAt, Date.now()),
  };
}

const VALID_NOTE_TYPES: NoteType[] = ['note', 'quote'];
function sanitizeNote(raw: unknown): BookNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const bookId = asString(r.bookId);
  if (!id || !bookId) return null;
  return {
    id,
    bookId,
    type: VALID_NOTE_TYPES.includes(r.type as NoteType) ? (r.type as NoteType) : 'note',
    text: asString(r.text),
    page: typeof r.page === 'number' && Number.isFinite(r.page) ? Math.floor(r.page) : undefined,
    createdAt: asNumber(r.createdAt, Date.now()),
  };
}

// Thrown when the picked file isn't a valid backup. The UI layer maps this
// code to a localized message (backup.ts stays free of user-facing strings).
export const INVALID_BACKUP = 'INVALID_BACKUP';

// Backup file = AppData plus base64 of locally-stored custom covers, keyed by
// book id. Remote (http) covers stay as URLs and aren't embedded.
interface BackupFile extends AppData {
  _covers?: Record<string, string>;
}

/** Write the full app data (with embedded local covers) and open the share sheet. */
export async function exportData(data: AppData, dialogTitle: string): Promise<boolean> {
  const covers: Record<string, string> = {};
  for (const b of data.books) {
    if (isLocalCover(b.coverUrl)) {
      const base64 = await coverToBase64(b.coverUrl as string);
      if (base64) covers[b.id] = base64;
    }
  }

  const payload: BackupFile = { ...data, _covers: covers };
  const json = JSON.stringify(payload, null, 2);
  const fileUri = `${FileSystem.cacheDirectory}tomo-backup-${toDateKey()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle,
      UTI: 'public.json',
    });
    return true;
  }
  return false;
}

/** Let the user pick a JSON backup file, parse it, and restore embedded covers. */
export async function importData(): Promise<AppData | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const content = await FileSystem.readAsStringAsync(res.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(content) as Partial<BackupFile>;
  } catch {
    throw new Error(INVALID_BACKUP);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.books)) {
    throw new Error(INVALID_BACKUP);
  }

  const books = parsed.books.map(sanitizeBook).filter((b): b is Book => b !== null);
  // A "backup" that restores zero books would silently wipe the whole library
  // (replaceAll deletes the current data and covers). Treat it as invalid.
  if (books.length === 0) throw new Error(INVALID_BACKUP);
  const bookIds = new Set(books.map((b) => b.id));
  const shelves = (Array.isArray(parsed.shelves) ? parsed.shelves : [])
    .map(sanitizeShelf)
    .filter((s): s is Shelf => s !== null);
  const shelfIds = new Set(shelves.map((s) => s.id));

  const result: AppData = {
    ...emptyData,
    books: books.map((b) => ({ ...b, shelfIds: b.shelfIds.filter((id) => shelfIds.has(id)) })),
    // drop sessions/notes that reference a book not present in the backup
    sessions: (Array.isArray(parsed.sessions) ? parsed.sessions : [])
      .map(sanitizeSession)
      .filter((s): s is ReadingSession => s !== null && bookIds.has(s.bookId)),
    notes: (Array.isArray(parsed.notes) ? parsed.notes : [])
      .map(sanitizeNote)
      .filter((n): n is BookNote => n !== null && bookIds.has(n.bookId)),
    shelves,
    goals: (Array.isArray(parsed.goals) ? parsed.goals : [])
      .map(sanitizeGoal)
      .filter((g): g is Goal => g !== null),
    version: typeof parsed.version === 'number' ? parsed.version : emptyData.version,
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
