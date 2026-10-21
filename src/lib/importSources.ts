// Goodreads / StoryGraph CSV → ImportedBook[]. Pure: relative imports with
// extension (not '@/…'), so the check scripts can round-trip an export under
// plain node, like csvExport.ts itself.
import type { ImportedBook, ReadingPace, ReadingStatus } from '../types/index.ts';
import { MOOD_OPTIONS } from '../types/index.ts';
import { parseCsv } from './csv.ts';
import { compactIsbn, normalizeIsbn } from './isbn.ts';
import { splitDateRanges } from './reads.ts';
import { parseLocalDateKey } from './utils.ts';

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
    // Goodreads's own export (every one has "Author l-f"; Tomo's and other
    // apps' Goodreads-style files don't) is the one whose titles carry a
    // series without a position: see parseSeries.
    const fromGoodreads = headers.includes('Author l-f');
    return { source: 'goodreads', books: rows.map((r) => mapGoodreads(r, fromGoodreads)).filter(isUsable) };
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
  // Keep the decimal point so "300.0" parses as 300 (stripping every
  // non-digit turned it into 3000); thousands separators are still dropped.
  const n = parseInt(v.replace(/[^0-9.]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function floatOrUndef(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Star rating clamped to Tomo's 0-5 scale (the backup sanitizer does the
 *  same; a hand-edited CSV must not produce a 45-star share card). */
function ratingOrUndef(v?: string): number | undefined {
  const n = floatOrUndef(v);
  return n != null ? Math.min(5, n) : undefined;
}

function cleanIsbn(v?: string): string | undefined {
  if (!v) return undefined;
  // Goodreads wraps ISBNs as ="9781234567890"; a valid value becomes the
  // canonical ISBN-13, an invalid-but-plausible one is kept as typed.
  const n = normalizeIsbn(v);
  if (n) return n;
  const digits = compactIsbn(v);
  return digits.length === 10 || digits.length === 13 ? digits : undefined;
}

function parseDate(v?: string): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  // A bare YYYY-MM-DD is parsed by Date.parse as UTC midnight, but every yearly
  // aggregate buckets in local time - so in negative-offset zones the date
  // slips to the previous day/year. Build a LOCAL date (at noon, DST-safe).
  const local = parseLocalDateKey(s);
  if (local != null) return local;
  const t = Date.parse(s.replace(/\//g, '-'));
  return Number.isFinite(t) ? t : undefined;
}

/**
 * StoryGraph "Dates Read": comma-separated `YYYY/MM/DD-YYYY/MM/DD` ranges,
 * oldest first; a trailing `YYYY/MM/DD-` is a read in progress. Dates are
 * matched with a regex rather than split on "-", which is also the range
 * separator.
 */
function parseDateRanges(v?: string): { start?: number; end?: number }[] {
  if (!v) return [];
  const out: { start?: number; end?: number }[] = [];
  for (const part of v.split(',')) {
    const dates = part.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g) ?? [];
    if (dates.length === 0) continue;
    const open = part.trim().endsWith('-');
    const start = parseDate(dates[0]);
    const end = dates.length > 1 ? parseDate(dates[dates.length - 1]) : open ? undefined : start;
    if (start == null && end == null) continue;
    out.push({ start, end });
  }
  return out;
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

// A trailing parenthesis that is an edition or format note rather than a
// series: "(Italian Edition)", "(2nd ed.)", "(Unabridged)", "(Vol. 2)"…
// (Letter classes, not \b: "é" isn't a word character for \b.)
const NOT_A_SERIES =
  /(?:^|[^\p{L}])(?:editions?|edizione|edición|édition|ausgabe|ed\.|éd\.|vols?\.|volumes?|translation|translated|paperback|hardcover|audiobook|unabridged|abridged|illustrated|annotated|reprint)(?!\p{L})/iu;

/**
 * "Title (Series Name, #2)" or "Title (Series Name #2)" → { title, series,
 * number }.
 *
 * With `numberless`, "Title (Series)" is a series too - that is how Goodreads
 * writes one without a position, and keeping it in the title changed the
 * title (the title|author match key) on re-import and duplicated the book.
 * Nothing tells "(Dune)" from a parenthesis that belongs to the title, so
 * this is only done for Goodreads's own export, where a trailing parenthesis
 * is a series in all but a few cases, and those few are screened out: it
 * must start with a capital (a proper name, not "(novel)"), not be a year or
 * a number, and not be an edition/format note. Tomo's own export never
 * writes "(Series)" without a number, so a parenthesised title in it stays
 * whole.
 */
function parseSeries(
  title: string,
  numberless = false
): { title: string; series?: string; seriesNumber?: number } {
  const m = title.match(/^(.*?)\s*\(([^()]*?),?\s*#(\d+(?:\.\d+)?)\)\s*$/);
  if (m) {
    return { title: m[1].trim(), series: m[2].trim(), seriesNumber: parseFloat(m[3]) };
  }
  const p = numberless ? title.match(/^(.+?)\s*\(([^()#]+)\)\s*$/) : null;
  if (p) {
    const series = p[2].trim();
    if (/^\p{Lu}/u.test(series) && !/^\d+$/.test(series) && !NOT_A_SERIES.test(series)) {
      return { title: p[1].trim(), series };
    }
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
    // Goodreads has no built-in DNF, so users make custom exclusive shelves
    // with these names - don't dump their abandoned books back into to-read.
    case 'dnf':
    case 'did-not-finish':
    case 'abandoned':
      return 'dnf';
    case 'on-hold':
    case 'paused':
      return 'paused';
    default:
      return 'want_to_read';
  }
}

function mapGoodreads(r: Record<string, string>, fromGoodreads: boolean): ImportedBook | null {
  const parsed = parseSeries(r['Title'] ?? '', fromGoodreads);
  if (!parsed.title) return null;
  // Tomo's own export carries the series as columns (a series without a
  // position has no place in the title convention); they win over the title.
  const seriesCol = (r['Series'] ?? '').trim();
  const seriesNumCol = parseFloat(r['Series Number'] ?? '');
  const series = seriesCol || parsed.series;
  const seriesNumber = Number.isFinite(seriesNumCol) ? seriesNumCol : parsed.seriesNumber;
  const authors = [r['Author'], ...splitList(r['Additional Authors'])]
    .map((a) => a?.trim())
    .filter(Boolean) as string[];
  const status = goodreadsStatus(r['Exclusive Shelf'] ?? '');
  const rating = ratingOrUndef(r['My Rating']);
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
    series,
    seriesNumber,
    publishedDate: (r['Original Publication Year'] || r['Year Published'] || '').trim() || undefined,
    addedAt: parseDate(r['Date Added']),
    finishedAt: status === 'finished' ? parseDate(r['Date Read']) : undefined,
    // Goodreads exports only the last "Date Read", so earlier reads are
    // counted (readCount) but not dated.
    readCount: num(r['Read Count']),
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
  const rating = ratingOrUndef(r['Star Rating']);
  const review = (r['Review'] ?? '').trim() || undefined;
  const history = splitDateRanges(parseDateRanges(r['Dates Read']));
  const finished = history.finishedAt ?? parseDate(r['Last Date Read']);

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
    startedAt: history.startedAt,
    finishedAt: status === 'finished' ? finished : undefined,
    // Earlier ranges are dated history (StoryGraph lists several only when the
    // book was read more than once). The last closed range is the current
    // cycle for a finished book, and for anything else (dnf, paused, an odd
    // "reading" row with no open range) it is the attempt that ended without a
    // finish - so it must not be banked as one.
    reads: history.reads,
    readCount: num(r['Read Count']),
    shelfNames: splitList(r['Tags']).length ? splitList(r['Tags']) : undefined,
  };
}
