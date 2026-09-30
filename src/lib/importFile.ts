import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
import { AppData } from '@/types';
import { parseBackup } from '@/lib/backup';
import { base64ToCover } from '@/lib/covers';
import { parseBookCsv } from '@/lib/importSources';
import { base64ToBytes, clampBundleTimes, ImportBundle, ShelfLabels, utf8Decode } from '@/lib/importBundle';
import { isOpenreadsBackup, isOpenreadsCsv, parseOpenreadsBackup, parseOpenreadsCsv } from '@/lib/importOpenreads';
import { EntryRow, isBookmoryXlsx, parseBookmoryEntries, parseBookmoryXlsx } from '@/lib/importBookmory';
import { useStore } from '@/store/useStore';

// One entry point for every file Tomo can import - picked in the app or
// shared to it from another app. The format is recognised from the content,
// never from the file name (Android renames freely: ".backup.zip", "(1)").

export type ImportKind =
  | { kind: 'tomo'; data: AppData }
  | { kind: 'bundle'; bundle: ImportBundle }
  | { kind: 'unsupported'; reason: 'unknown' | 'tooLarge' | 'openreadsOld' | 'empty' };

const MAX_BYTES = 128 * 1024 * 1024;

export async function readImportFile(uri: string, labels: ShelfLabels): Promise<ImportKind> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && info.size > MAX_BYTES) return { kind: 'unsupported', reason: 'tooLarge' };
  if (info.exists && info.size === 0) return { kind: 'unsupported', reason: 'empty' };
  // Sniff the first bytes; only zips go through the (slower) JS byte path.
  const magic = base64ToBytes(
    await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 4 })
  );

  const ARCHIVE_TOO_LARGE = 'archive too large';
  const MAX_ENTRY = 64 * 1024 * 1024;
  // ...and all of it together: many "small" entries are a zip bomb too.
  const MAX_TOTAL = 160 * 1024 * 1024;
  const MAX_ENTRIES = 5000;
  // Zip: Openreads backup, Bookmory database or Bookmory Excel export.
  if (magic[0] === 0x50 && magic[1] === 0x4b) {
    const bytes = base64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
    let total = 0;
    let count = 0;
    let files: ReturnType<typeof unzipSync>;
    try {
      files = unzipSync(bytes, {
        // Skip the heavy parts we don't read (Bookmory's note images, …).
        // Nothing we read is this big: a larger entry is a zip bomb or not ours.
        filter: (f) => {
          const wanted =
            f.originalSize <= MAX_ENTRY &&
            (f.name === 'books.backup' ||
              f.name === 'info.txt' ||
              f.name === 'books.sql' ||
              /^\d+\.jpg$/.test(f.name) ||
              /\.db$/.test(f.name) ||
              f.name.startsWith('xl/'));
          if (!wanted) return false;
          total += f.originalSize;
          if (++count > MAX_ENTRIES || total > MAX_TOTAL) throw new Error(ARCHIVE_TOO_LARGE);
          return true;
        },
      });
    } catch (e) {
      if (e instanceof Error && e.message === ARCHIVE_TOO_LARGE) return { kind: 'unsupported', reason: 'tooLarge' };
      throw e;
    }
    if (isOpenreadsBackup(files)) return { kind: 'bundle', bundle: parseOpenreadsBackup(files, labels) };
    if (files['books.sql']) return { kind: 'unsupported', reason: 'openreadsOld' };
    const db = Object.keys(files).find((n) => /\.db$/.test(n));
    if (db) return { kind: 'bundle', bundle: parseBookmoryEntries(await readSembast(files[db]), labels) };
    if (isBookmoryXlsx(files)) return { kind: 'bundle', bundle: parseBookmoryXlsx(files, labels) };
    return { kind: 'unsupported', reason: 'unknown' };
  }

  // Text (JSON backups can be tens of MB): decoded natively. A file that
  // isn't valid UTF-8 (Latin-1 CSV) falls back to the tolerant JS decoder.
  let text: string;
  try {
    text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    text = utf8Decode(base64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })));
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const head = text.trimStart();
  if (!head) return { kind: 'unsupported', reason: 'empty' };
  if (head.startsWith('{')) {
    // parseBackup throws INVALID_BACKUP for JSON that isn't one of ours.
    return { kind: 'tomo', data: await parseBackup(text) };
  }
  const firstLine = head.slice(0, head.search(/\r?\n/) >>> 0);
  const headers = firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  if (isOpenreadsCsv(headers)) return { kind: 'bundle', bundle: parseOpenreadsCsv(text, labels) };
  const csv = parseBookCsv(text);
  if (csv) {
    return {
      kind: 'bundle',
      bundle: {
        source: csv.source,
        books: csv.books.map((b, i) => ({ ...b, key: `csv:${i}` })),
        notes: [],
        sessions: [],
      },
    };
  }
  return { kind: 'unsupported', reason: 'unknown' };
}

/** The `entry` rows of a Bookmory (sembast) SQLite database. */
async function readSembast(bytes: Uint8Array): Promise<EntryRow[]> {
  // Loaded lazily: only this import needs the SQLite module.
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.deserializeDatabaseAsync(bytes);
  try {
    const rows = await db.getAllAsync<{ store: string; key: unknown; value: string }>(
      'SELECT store, key, value FROM entry WHERE deleted IS NULL OR deleted = 0'
    );
    return rows.map((r) => ({
      store: r.store,
      key: r.key instanceof Uint8Array ? utf8Decode(r.key) : String(r.key),
      value: r.value,
    }));
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

export interface BundleResult {
  added: number;
  matched: number;
  notes: number;
  sessions: number;
  addedIds: string[];
}

/** Save embedded covers as local files, then import into the library. */
export async function applyBundle(bundle: ImportBundle): Promise<BundleResult> {
  clampBundleTimes(bundle);
  for (const b of bundle.books) {
    if (!b.coverBase64 || b.coverUrl) continue;
    try {
      b.coverUrl = await base64ToCover(b.coverBase64);
    } catch {
      // no cover then; the catalogue lookup may still find one
    }
    delete b.coverBase64;
  }
  return useStore.getState().importBundle(bundle);
}
