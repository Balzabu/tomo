// Read-history helpers - pure (type-only imports) so they run under plain node.
//
// Model: `book.reads` holds only *earlier, completed* cycles; the current cycle
// is `book.startedAt` / `book.finishedAt` (counted only while the book's status
// is 'finished', exactly as before this history existed). A finish is therefore
// either in `reads` or the current cycle - never both - so old data needs no
// migration and nothing is double-counted. `startReread` is the single producer
// of `reads` entries.
import type { Book, ReadRecord, ReadingSession } from '@/types';
import { readingDayKey } from './readingDay.ts';

/** Every dated finish of a book: past cycles plus the current one when finished. */
export function finishesOf(b: Book): ReadRecord[] {
  const past = b.reads ?? [];
  if (b.status === 'finished' && b.finishedAt) {
    return [...past, { startedAt: b.startedAt, finishedAt: b.finishedAt }];
  }
  return past;
}

/** The year a finish counts for: its reading day's, so a book closed at 01:00
 *  on Jan 1 belongs to the evening (and the year) it was read in. Every
 *  yearly bucket of finishes (goals, stats, wrapped) agrees on this. */
export function finishYear(finishedAt: number): number {
  return Number(readingDayKey(finishedAt).slice(0, 4));
}

export function finishesInYear(b: Book, year: number): number {
  let n = 0;
  for (const r of finishesOf(b)) if (finishYear(r.finishedAt) === year) n++;
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
  // A new read starts without the previous read's deadline.
  b = { ...b, plan: undefined };
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
    rereading: true,
  };
}

/** finishedAt/readCount for a book reaching "finished" (by status or by its
 *  last page). Only a genuinely new read cycle increases readCount: a book
 *  that already counts as read (imported "read" with no date, or already
 *  finished) keeps its count and gets no invented finish date - unless the
 *  cycle was started with startReread, which is always a new read. */
export function finishFields(b: Book, now: number): Pick<Book, 'finishedAt' | 'readCount' | 'rereading'> {
  const alreadyRead =
    !b.rereading && (b.status === 'finished' || (b.readCount ?? 0) > (b.reads?.length ?? 0));
  const patch: Pick<Book, 'finishedAt' | 'readCount' | 'rereading'> = {
    finishedAt: b.finishedAt ?? (alreadyRead ? undefined : now),
  };
  if (!b.finishedAt && !alreadyRead) patch.readCount = (b.readCount ?? 0) + 1;
  if (b.rereading) patch.rereading = undefined;
  return patch;
}

/** A book moved to `currentPage` (clamped to its length) at moment `at`:
 *  starts it when it leaves want-to-read, finishes it on the last page, and
 *  moves a finished book back to reading when the page is corrected
 *  downwards. `at` is when the reading happened (a session's end), so a
 *  backdated session finishes the book on its own day, not today. Always
 *  returns a new object (the change is stamped even when the page is the
 *  same). */
export function applyProgress(b: Book, currentPage: number, at: number = Date.now()): Book {
  const max = b.pageCount && b.pageCount > 0 ? b.pageCount : Infinity;
  const page = Math.max(0, Math.min(currentPage, max));
  const patch: Partial<Book> = { currentPage: page };
  if (b.status === 'want_to_read' && page > 0) {
    patch.status = 'reading';
    patch.startedAt = b.startedAt ?? at;
  }
  if (b.pageCount && page >= b.pageCount) {
    patch.status = 'finished';
    // startReread clears finishedAt; ordinary status corrections keep it.
    // Re-saving the last page of a book already read (imported without a
    // date) is not a new read - see finishFields.
    Object.assign(patch, finishFields(b, at));
    // A finish can't precede its start (the book was marked "reading" today,
    // then its last session logged for last week): as setReadDates does.
    const startedAt = patch.startedAt ?? b.startedAt;
    if (patch.finishedAt != null && startedAt != null && startedAt > patch.finishedAt) {
      patch.startedAt = patch.finishedAt;
    }
  } else if (b.status === 'finished' && b.pageCount && page < b.pageCount) {
    // Moving a finished book back to an earlier page is a correction
    // ("I hadn't actually finished"): it can't stay "finished at page
    // 50 of 300". finishedAt/readCount are kept, like setStatus does.
    patch.status = 'reading';
  }
  return { ...b, ...patch };
}

/** When a session's reading ended: when the clock stopped, else its start
 *  plus duration, else its start. 0 for a session without usable times. */
export function sessionEnd(s: Pick<ReadingSession, 'startTime' | 'endTime' | 'durationSeconds'>): number {
  if (s.endTime > 0) return s.endTime;
  if (s.startTime > 0) return s.startTime + Math.max(0, s.durationSeconds || 0) * 1000;
  return 0;
}

/** Whether the book's finish was recorded by this session: it reached the
 *  last page and finishedAt sits on it - at its end, or (sessions saved
 *  before 1.5.5 stamped the finish with the moment they were logged) within
 *  a day after it. A finish set earlier, by hand or by another session, is
 *  not this session's to undo. */
function finishedBy(b: Book, s: ReadingSession): boolean {
  if (!b.pageCount || b.finishedAt == null || s.endPage == null || s.endPage < b.pageCount) return false;
  return b.finishedAt >= s.startTime && b.finishedAt <= sessionEnd(s) + 86_400_000;
}

/** The finish a session recorded follows it when the session is moved (its
 *  day corrected) and still reaches the last page: `at` is the edited
 *  session's end. Same object when the finish isn't the session's. */
export function withFinishMoved(b: Book, old: ReadingSession, next: ReadingSession, at: number): Book {
  if (b.status !== 'finished' || !finishedBy(b, old) || !finishedBy({ ...b, finishedAt: at }, next)) return b;
  if (!(at > 0) || at === b.finishedAt) return b;
  const startedAt = b.startedAt != null && b.startedAt > at ? at : b.startedAt;
  return { ...b, finishedAt: at, startedAt };
}

/** The book after one of its sessions was deleted or edited: `old` is the
 *  session as it was, `remaining` the book's sessions afterwards (the edited
 *  one included). When `old` was the one that set the book's page, the page
 *  falls back to what the remaining sessions reached (never forward: the
 *  page may have been corrected by hand); a book finished by that session
 *  goes back to reading, undoing what finishFields recorded. Returns the
 *  same object when nothing changes. */
export function withSessionRemoved(b: Book, old: ReadingSession, remaining: ReadingSession[]): Book {
  // Only the session that set the page: a page moved by hand since (up or
  // down) is the reader's, whatever the session reached.
  if (old.endPage == null || old.endPage !== b.currentPage) return b;
  let reached: number | undefined;
  let floor = 0;
  for (const s of remaining) {
    if (s.endPage != null) reached = Math.max(reached ?? 0, s.endPage);
    if (s.startPage != null) floor = Math.max(floor, s.startPage);
  }
  // No other session has pages: back to where this one picked the book up;
  // without even that, keep the page (it may have been set by hand).
  const page = Math.min(b.currentPage, Math.max(reached ?? old.startPage ?? b.currentPage, floor));
  if (page === b.currentPage) return b;
  if (b.status !== 'finished' || !b.pageCount) return { ...b, currentPage: page };
  // Finished on its own account (by status, or before this session): a page
  // below the end would contradict that, so leave the book alone.
  if (!finishedBy(b, old)) return b;
  // Undo finishFields: the dated finish and the read it counted. A reread
  // whose count still exceeds the dated history stays an open reread, so
  // finishing it again counts again.
  const dated = b.reads?.length ?? 0;
  const readCount = Math.max(dated, (b.readCount ?? 1) - 1);
  return {
    ...b,
    currentPage: page,
    status: 'reading',
    finishedAt: undefined,
    readCount: readCount > 0 ? readCount : undefined,
    rereading: readCount > dated ? true : undefined,
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
