import { ImportedBook, MOOD_OPTIONS, ReadingPace, ReadingStatus } from '@/types';
import { parseCsv } from '@/lib/csv';

export type ImportSource = 'goodreads' | 'storygraph';

export interface ImportResult {
  source: ImportSource;
  books: ImportedBook[];
}

/** Detect the export format from the CSV and map it to ImportedBook[]. */
export function parseBookCsv(text: string): ImportResult | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);

  if (headers.includes('Exclusive Shelf') || headers.includes('Book Id')) {
    return { source: 'goodreads', books: rows.map(mapGoodreads).filter(isUsable) };
  }
  if (headers.includes('Read Status')) {
    return { source: 'storygraph', books: rows.map(mapStoryGraph).filter(isUsable) };
  }
  return null;
}

function isUsable(b: ImportedBook | null): b is ImportedBook {
  return !!b && !!b.title?.trim();
}

function num(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function floatOrUndef(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanIsbn(v?: string): string | undefined {
  if (!v) return undefined;
  // Goodreads wraps ISBNs as ="9781234567890"
  const digits = v.replace(/[^0-9Xx]/g, '');
  return digits.length === 10 || digits.length === 13 ? digits : undefined;
}

function parseDate(v?: string): number | undefined {
  if (!v) return undefined;
  const s = v.trim().replace(/\//g, '-');
  // A bare YYYY-MM-DD is parsed by Date.parse as UTC midnight, but every yearly
  // aggregate buckets in local time - so in negative-offset zones the date
  // slips to the previous day/year. Build a LOCAL date (at noon, DST-safe).
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime();
    return Number.isFinite(t) ? t : undefined;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

function splitList(v?: string): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeMoods(v?: string): string[] | undefined {
  const list = splitList(v).map((m) => m.toLowerCase());
  const known = list.filter((m) => (MOOD_OPTIONS as readonly string[]).includes(m));
  return known.length ? known : undefined;
}

function normalizePace(v?: string): ReadingPace | undefined {
  const p = (v ?? '').toLowerCase();
  if (p.startsWith('slow')) return 'slow';
  if (p.startsWith('medium') || p.startsWith('moderate')) return 'medium';
  if (p.startsWith('fast')) return 'fast';
  return undefined;
}

/** "Series Name, #2" or "Series Name #2" → { series, number }. */
function parseSeries(title: string): { title: string; series?: string; seriesNumber?: number } {
  const m = title.match(/^(.*?)\s*\(([^()]*?),?\s*#(\d+(?:\.\d+)?)\)\s*$/);
  if (m) {
    return { title: m[1].trim(), series: m[2].trim(), seriesNumber: parseFloat(m[3]) };
  }
  return { title: title.trim() };
}

function goodreadsStatus(shelf: string): ReadingStatus {
  switch (shelf.trim().toLowerCase()) {
    case 'read':
      return 'finished';
    case 'currently-reading':
      return 'reading';
    case 'to-read':
      return 'want_to_read';
    default:
      return 'want_to_read';
  }
}

function mapGoodreads(r: Record<string, string>): ImportedBook | null {
  const parsed = parseSeries(r['Title'] ?? '');
  if (!parsed.title) return null;
  const authors = [r['Author'], ...splitList(r['Additional Authors'])]
    .map((a) => a?.trim())
    .filter(Boolean) as string[];
  const status = goodreadsStatus(r['Exclusive Shelf'] ?? '');
  const rating = floatOrUndef(r['My Rating']);
  const exclusive = new Set(['read', 'currently-reading', 'to-read']);
  const shelfNames = splitList(r['Bookshelves']).filter((s) => !exclusive.has(s.toLowerCase()));
  const review = (r['My Review'] ?? '').replace(/<br\s*\/?>/gi, '\n').trim() || undefined;

  return {
    title: parsed.title,
    authors,
    isbn: cleanIsbn(r['ISBN13']) ?? cleanIsbn(r['ISBN']),
    pageCount: num(r['Number of Pages']),
    status,
    rating: rating && rating > 0 ? rating : undefined,
    review,
    series: parsed.series,
    seriesNumber: parsed.seriesNumber,
    publishedDate: (r['Original Publication Year'] || r['Year Published'] || '').trim() || undefined,
    addedAt: parseDate(r['Date Added']),
    finishedAt: status === 'finished' ? parseDate(r['Date Read']) : undefined,
    shelfNames: shelfNames.length ? shelfNames : undefined,
  };
}

function storyGraphStatus(s: string): ReadingStatus {
  switch (s.trim().toLowerCase()) {
    case 'read':
      return 'finished';
    case 'currently-reading':
    case 'currently reading':
      return 'reading';
    case 'to-read':
    case 'to read':
      return 'want_to_read';
    case 'did-not-finish':
    case 'did not finish':
      return 'dnf';
    default:
      return 'want_to_read';
  }
}

function mapStoryGraph(r: Record<string, string>): ImportedBook | null {
  const parsed = parseSeries(r['Title'] ?? '');
  if (!parsed.title) return null;
  const authors = splitList(r['Authors']);
  const status = storyGraphStatus(r['Read Status'] ?? '');
  const rating = floatOrUndef(r['Star Rating']);
  const review = (r['Review'] ?? '').trim() || undefined;
  const finished =
    parseDate(r['Last Date Read']) ?? parseDate((r['Dates Read'] ?? '').split('-').pop());

  return {
    title: parsed.title,
    authors,
    isbn: cleanIsbn(r['ISBN/UID'] ?? r['ISBN']),
    status,
    rating,
    review,
    series: parsed.series,
    seriesNumber: parsed.seriesNumber,
    moods: normalizeMoods(r['Moods']),
    pace: normalizePace(r['Pace']),
    addedAt: parseDate(r['Date Added']),
    finishedAt: status === 'finished' ? finished : undefined,
    shelfNames: splitList(r['Tags']).length ? splitList(r['Tags']) : undefined,
  };
}
