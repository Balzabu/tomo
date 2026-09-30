// Openreads (FOSS reading tracker) exports: the ".backup" zip (v4/v5) and the
// CSV export. Formats read from the Openreads source (lib/model/book.dart,
// core/helpers/backup) and checked against real files. Pure - see
// importBundle.ts.
import type { ReadingStatus } from '@/types';
import { parseCsv } from './csv.ts';
import { normalizeIsbn } from './isbn.ts';
import type { BundleBook, BundleNote, ImportBundle, ShelfLabels } from './importBundle.ts';
import { bytesToBase64, parseLocalIso, splitReads, utf8Decode } from './importBundle.ts';

const STATUS_BY_INT: Record<number, ReadingStatus> = { 0: 'finished', 1: 'reading', 2: 'want_to_read', 3: 'dnf' };
const STATUS_BY_NAME: Record<string, ReadingStatus> = {
  finished: 'finished',
  in_progress: 'reading',
  planned: 'want_to_read',
  abandoned: 'dnf',
};

/** "start|finish|customTimeMs" readings joined with ";" (empty part = none). */
function parseReadings(v: unknown): { start?: number; end?: number }[] {
  if (typeof v !== 'string' || !v.trim()) return [];
  const out: { start?: number; end?: number }[] = [];
  for (const part of v.split(';')) {
    const [s, f] = part.split('|');
    const start = parseLocalIso(s);
    const end = parseLocalIso(f);
    if (start == null && end == null) continue;
    out.push({ start, end });
  }
  // Oldest first (Openreads keeps them in entry order).
  return out.sort((a, b) => (a.start ?? a.end ?? 0) - (b.start ?? b.end ?? 0));
}

function splitTags(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split('|||||')
    .map((s) => s.trim())
    .filter(Boolean);
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

interface RawBook {
  id?: number | string;
  title?: string;
  author?: string;
  description?: string | null;
  status?: number | string;
  rating?: number | string | null;
  favourite?: number | boolean | string;
  deleted?: number | boolean | string;
  pages?: number | string | null;
  publication_year?: number | string | null;
  isbn?: string | null;
  tags?: string | null;
  my_review?: string | null;
  notes?: string | null;
  readings?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  date_added?: string | null;
  has_cover?: number;
  cover?: number[] | null;
}

function truthy(v: unknown): boolean {
  return v === 1 || v === true || v === '1' || v === 'true' || v === 'TRUE';
}

function mapBook(raw: RawBook, key: string, labels: ShelfLabels, rating: number | undefined): { book: BundleBook; note?: BundleNote } | null {
  const title = nonEmpty(raw.title);
  if (!title || truthy(raw.deleted)) return null;
  const status =
    typeof raw.status === 'number'
      ? STATUS_BY_INT[raw.status] ?? 'finished'
      : STATUS_BY_NAME[String(raw.status ?? '').trim()] ?? 'want_to_read';
  let readings = parseReadings(raw.readings);
  // Pre-2.2 books carried single start/finish dates instead.
  if (!readings.length && (raw.start_date || raw.finish_date)) {
    readings = [{ start: parseLocalIso(raw.start_date), end: parseLocalIso(raw.finish_date) }];
  }
  const dates = splitReads(readings, status === 'finished');
  const pages = Number(raw.pages);
  const pageCount = Number.isFinite(pages) && pages > 0 ? Math.round(pages) : undefined;
  const shelves = splitTags(raw.tags);
  if (truthy(raw.favourite)) shelves.push(labels.favourites);
  const addedAt = parseLocalIso(raw.date_added);
  const book: BundleBook = {
    key,
    title,
    authors: (nonEmpty(raw.author) ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    isbn: nonEmpty(raw.isbn) ? normalizeIsbn(raw.isbn as string) ?? (raw.isbn as string).trim() : undefined,
    pageCount,
    status,
    currentPage: status === 'finished' && pageCount ? pageCount : 0,
    rating: rating && rating > 0 ? Math.min(5, rating) : undefined,
    review: nonEmpty(raw.my_review),
    description: nonEmpty(raw.description),
    publishedDate: raw.publication_year ? String(raw.publication_year) : undefined,
    addedAt,
    ...dates,
    shelfNames: shelves.length ? shelves : undefined,
  };
  if (Array.isArray(raw.cover) && raw.cover.length) {
    book.coverBase64 = bytesToBase64(Uint8Array.from(raw.cover));
  }
  const noteText = nonEmpty(raw.notes);
  const note: BundleNote | undefined = noteText
    ? { bookKey: key, type: 'note', text: noteText, createdAt: addedAt ?? Date.now() }
    : undefined;
  return { book, note };
}

/** Files inside an Openreads ".backup" zip (name → bytes). */
export function isOpenreadsBackup(files: Record<string, Uint8Array>): boolean {
  return 'books.backup' in files;
}

export function parseOpenreadsBackup(files: Record<string, Uint8Array>, labels: ShelfLabels): ImportBundle {
  const bundle: ImportBundle = { source: 'openreads', books: [], notes: [], sessions: [] };
  const text = utf8Decode(files['books.backup'] ?? new Uint8Array());
  // v2 used "|||||" between books; v3+ "@@@@@" (the app normalises the same way).
  const chunks = text.replace(/\}\|\|\|\|\|\{/g, '}@@@@@{').split('@@@@@');
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    let raw: RawBook;
    try {
      raw = JSON.parse(chunk) as RawBook;
    } catch {
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    // Id-less rows get their own namespace: "or:3" could be a real id.
    const key = raw.id != null ? `or:${raw.id}` : `or:noid:${bundle.books.length}`;
    const r = Number(raw.rating);
    const m = mapBook(raw, key, labels, Number.isFinite(r) ? r / 10 : undefined);
    if (!m) continue;
    // v5 ships covers as "<id>.jpg" next to books.backup.
    const cover = files[`${raw.id}.jpg`];
    if (cover && !m.book.coverBase64) m.book.coverBase64 = bytesToBase64(cover);
    bundle.books.push(m.book);
    if (m.note) bundle.notes.push(m.note);
  }
  return bundle;
}

export function isOpenreadsCsv(headers: string[]): boolean {
  return headers.includes('book_format') && headers.includes('readings') && headers.includes('title');
}

export function parseOpenreadsCsv(text: string, labels: ShelfLabels): ImportBundle {
  const bundle: ImportBundle = { source: 'openreads', books: [], notes: [], sessions: [] };
  parseCsv(text).forEach((row, i) => {
    const r = parseFloat(row.rating);
    const m = mapBook(row as unknown as RawBook, `orcsv:${i}`, labels, Number.isFinite(r) ? r : undefined);
    if (!m) return;
    bundle.books.push(m.book);
    if (m.note) bundle.notes.push(m.note);
  });
  return bundle;
}
