// Goodreads-style CSV export - pure and dependency-free (node-checkable).
//
// The column set is the subset of a Goodreads library export that Tomo's own
// importer (src/lib/importSources.ts) and other reading apps read back, so a
// file exported here round-trips into Tomo and imports into Goodreads /
// StoryGraph. Sessions and notes have no place in this format; the JSON backup
// carries those.
import type { AppData, Book, ReadingStatus } from '@/types';

export const CSV_COLUMNS = [
  'Book Id',
  'Title',
  'Author',
  'Additional Authors',
  'ISBN',
  'ISBN13',
  'My Rating',
  'Publisher',
  'Number of Pages',
  'Year Published',
  'Original Publication Year',
  'Date Read',
  'Date Added',
  'Bookshelves',
  'Exclusive Shelf',
  'My Review',
  'Read Count',
] as const;

const EXCLUSIVE: Record<ReadingStatus, string> = {
  finished: 'read',
  reading: 'currently-reading',
  want_to_read: 'to-read',
  paused: 'on-hold',
  dnf: 'dnf',
};

/** Goodreads writes dates as YYYY/MM/DD (local). */
function csvDate(ts?: number): string {
  if (ts == null) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Title as Goodreads spells series: "Dune (Dune, #1)" - parseSeries() on
 *  import splits it back. */
function csvTitle(b: Book): string {
  if (!b.series) return b.title;
  const n = b.seriesNumber != null ? `, #${b.seriesNumber}` : '';
  return `${b.title} (${b.series}${n})`;
}

export function bookToCsvRow(b: Book, shelfNames: Map<string, string>): string[] {
  const isbn13 = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';
  const isbn10 = b.isbn && !isbn13 ? b.isbn : '';
  const shelves = b.shelfIds
    .map((id) => shelfNames.get(id))
    .filter((n): n is string => !!n)
    // the list is comma-separated, so a shelf name can't contain one
    .map((n) => n.replace(/,/g, ' '));
  const year = b.publishedDate?.match(/\b(\d{4})\b/)?.[1] ?? '';
  const readCount = Math.max(b.readCount ?? 0, (b.reads?.length ?? 0) + (b.finishedAt ? 1 : 0));
  return [
    b.id,
    csvTitle(b),
    b.authors[0] ?? '',
    b.authors.slice(1).join(', '),
    // Goodreads wraps ISBNs as ="…" so spreadsheets keep the leading zeros.
    isbn10 ? `="${isbn10}"` : '',
    isbn13 ? `="${isbn13}"` : '',
    b.rating != null && b.rating > 0 ? String(b.rating) : '0',
    b.publisher ?? '',
    b.pageCount != null ? String(b.pageCount) : '',
    year,
    year,
    b.status === 'finished' ? csvDate(b.finishedAt) : '',
    csvDate(b.addedAt),
    shelves.join(', '),
    EXCLUSIVE[b.status],
    b.review ?? '',
    readCount > 0 ? String(readCount) : '',
  ];
}

export function toGoodreadsCsv(data: AppData): string {
  const shelfNames = new Map(data.shelves.map((s) => [s.id, s.name]));
  const lines = [CSV_COLUMNS.map(csvField).join(',')];
  for (const b of data.books) lines.push(bookToCsvRow(b, shelfNames).map(csvField).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
