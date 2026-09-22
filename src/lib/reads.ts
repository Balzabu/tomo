// Read-history helpers - pure (type-only imports) so they run under plain node.
//
// Model: `book.reads` holds only *earlier, completed* cycles; the current cycle
// is `book.startedAt` / `book.finishedAt` (counted only while the book's status
// is 'finished', exactly as before this history existed). A finish is therefore
// either in `reads` or the current cycle - never both - so old data needs no
// migration and nothing is double-counted. `startReread` is the single producer
// of `reads` entries.
import type { Book, ReadRecord } from '@/types';

/** Every dated finish of a book: past cycles plus the current one when finished. */
export function finishesOf(b: Book): ReadRecord[] {
  const past = b.reads ?? [];
  if (b.status === 'finished' && b.finishedAt) {
    return [...past, { startedAt: b.startedAt, finishedAt: b.finishedAt }];
  }
  return past;
}

export function finishesInYear(b: Book, year: number): number {
  let n = 0;
  for (const r of finishesOf(b)) if (new Date(r.finishedAt).getFullYear() === year) n++;
  return n;
}

/** Number of finishes in a year. A book read twice in the same year counts
 *  twice - that is what a "books per year" goal measures. */
export function countFinishesInYear(books: Book[], year: number): number {
  let n = 0;
  for (const b of books) n += finishesInYear(b, year);
  return n;
}

/** Books with at least one finish in the year, each once - for per-book
 *  aggregates (top author, longest book, average rating, moods). */
export function booksFinishedInYear(books: Book[], year: number): Book[] {
  return books.filter((b) => finishesInYear(b, year) > 0);
}

/** Times read, for display. `readCount` is a stored floor (imports may know a
 *  count without the dates); the dated history can only raise it. */
export function readCountOf(b: Book): number {
  const dated = (b.reads?.length ?? 0) + (b.finishedAt ? 1 : 0);
  return Math.max(b.readCount ?? 0, dated);
}

/** Start a fresh read cycle: bank the current finish into `reads`, then back
 *  to "reading" from page 0. readCount is preserved and bumped again when this
 *  cycle reaches the end (via setProgress/setStatus). */
export function withRereadStarted(b: Book, now: number): Book {
  const reads = b.finishedAt
    ? [...(b.reads ?? []), { startedAt: b.startedAt, finishedAt: b.finishedAt }]
    : b.reads;
  return {
    ...b,
    reads,
    status: 'reading',
    currentPage: 0,
    startedAt: now,
    finishedAt: undefined,
  };
}

/** Coerce an untrusted `reads` value (backup file, CSV) into clean records:
 *  finite numbers only, finishedAt required, ascending, no duplicate finishes. */
export function sanitizeReads(v: unknown): ReadRecord[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ReadRecord[] = [];
  const seen = new Set<number>();
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const finishedAt = typeof r.finishedAt === 'number' && Number.isFinite(r.finishedAt) ? r.finishedAt : null;
    if (finishedAt == null || seen.has(finishedAt)) continue;
    seen.add(finishedAt);
    const startedAt =
      typeof r.startedAt === 'number' && Number.isFinite(r.startedAt) && r.startedAt <= finishedAt
        ? r.startedAt
        : undefined;
    out.push(startedAt != null ? { startedAt, finishedAt } : { finishedAt });
  }
  out.sort((a, b) => a.finishedAt - b.finishedAt);
  return out.length ? out : undefined;
}

/** Turn a list of date ranges (e.g. StoryGraph "Dates Read") into the model:
 *  the last closed range is the current cycle, earlier closed ranges become
 *  `reads`, and a trailing open range (started, not finished) only yields
 *  `startedAt`. */
export function splitDateRanges(ranges: { start?: number; end?: number }[]): {
  reads?: ReadRecord[];
  startedAt?: number;
  finishedAt?: number;
} {
  const closed = ranges
    .filter((r): r is { start?: number; end: number } => r.end != null)
    .sort((a, b) => a.end - b.end);
  const open = ranges.find((r) => r.end == null && r.start != null);
  const current = closed[closed.length - 1];
  const past = closed.slice(0, -1).map((r) => (r.start != null ? { startedAt: r.start, finishedAt: r.end } : { finishedAt: r.end }));
  if (open) {
    // Reading again right now: every closed range is history.
    const all = current ? [...past, current.start != null ? { startedAt: current.start, finishedAt: current.end } : { finishedAt: current.end }] : past;
    return { reads: all.length ? all : undefined, startedAt: open.start };
  }
  return {
    reads: past.length ? past : undefined,
    startedAt: current?.start,
    finishedAt: current?.end,
  };
}
