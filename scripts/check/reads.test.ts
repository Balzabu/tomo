import assert from 'node:assert/strict';
import { finishesOf, countFinishesInYear, booksFinishedInYear, readCountOf, withRereadStarted, sanitizeReads, splitDateRanges } from '../../src/lib/reads.ts';
const ts = (y: number, m = 6) => new Date(y, m, 15, 12).getTime();
const base: any = { id: 'b', title: 'T', authors: [], status: 'finished', currentPage: 300, pageCount: 300, addedAt: 1, startedAt: ts(2025, 1), finishedAt: ts(2025, 3), readCount: 1, shelfIds: [], source: 'manual' };
// old data, no reads
assert.equal(finishesOf(base).length, 1);
assert.equal(countFinishesInYear([base], 2025), 1);
assert.equal(countFinishesInYear([base], 2024), 0);
assert.equal(readCountOf(base), 1);
// reread: past finish stays in 2025
const r1 = withRereadStarted(base, ts(2026, 0));
assert.equal(r1.status, 'reading'); assert.equal(r1.currentPage, 0); assert.equal(r1.finishedAt, undefined);
assert.equal(r1.reads!.length, 1);
assert.equal(countFinishesInYear([r1], 2025), 1);   // <-- the bug being fixed
assert.equal(countFinishesInYear([r1], 2026), 0);
assert.equal(readCountOf(r1), 1);
// finish the reread in 2026, then reread again
const r1f = { ...r1, status: 'finished', finishedAt: ts(2026, 2), readCount: 2 };
assert.equal(countFinishesInYear([r1f], 2026), 1);
assert.equal(booksFinishedInYear([r1f], 2026).length, 1);
const r2 = withRereadStarted(r1f, ts(2026, 5));
assert.equal(r2.reads!.length, 2);
const r2f = { ...r2, status: 'finished', finishedAt: ts(2026, 8), readCount: 3 };
assert.equal(countFinishesInYear([r2f], 2026), 2);        // twice in one year counts twice for goals
assert.equal(booksFinishedInYear([r2f], 2026).length, 1); // but the book appears once
assert.equal(readCountOf(r2f), 3);
// reread on a never-finished book adds nothing
assert.equal(withRereadStarted({ ...base, finishedAt: undefined, status: 'reading' }, 5).reads, undefined);
// finished → dnf stops counting current cycle, keeps history
assert.equal(countFinishesInYear([{ ...r2f, status: 'dnf' }], 2026), 1);
// sanitizeReads
assert.deepEqual(sanitizeReads([{ finishedAt: 20, startedAt: 30 }, { finishedAt: 10, startedAt: 5 }, { finishedAt: 20 }, 'x', { startedAt: 1 }, { finishedAt: NaN }]),
  [{ startedAt: 5, finishedAt: 10 }, { finishedAt: 20 }]);
assert.equal(sanitizeReads([]), undefined);
assert.equal(sanitizeReads('nope'), undefined);
// splitDateRanges
const s1 = splitDateRanges([{ start: 1, end: 2 }, { start: 5, end: 6 }]);
assert.deepEqual(s1, { reads: [{ startedAt: 1, finishedAt: 2 }], startedAt: 5, finishedAt: 6 });
const s2 = splitDateRanges([{ start: 1, end: 2 }, { start: 9 }]);
assert.deepEqual(s2, { reads: [{ startedAt: 1, finishedAt: 2 }], startedAt: 9 });
assert.deepEqual(splitDateRanges([]), { reads: undefined, startedAt: undefined, finishedAt: undefined });
assert.deepEqual(splitDateRanges([{ end: 4 }]), { reads: undefined, startedAt: undefined, finishedAt: 4 });
console.log('reads: all assertions passed');

// ---- reread of a book whose earlier reads are undated ----
import { finishFields } from '../../src/lib/reads.ts';
{
  const now = new Date(2026, 8, 30, 12).getTime();
  const finish = (b: any) => ({ ...b, status: 'finished', currentPage: b.pageCount, ...finishFields(b, now) });
  // Goodreads "read" with no date (readCount 1), and "Read Count 2" with one date
  const undated: any = { id: 'a', title: 'A', authors: [], status: 'finished', currentPage: 100, pageCount: 100, readCount: 1, shelfIds: [], addedAt: 1, source: 'import' };
  const twice: any = { ...undated, id: 'b', readCount: 2, finishedAt: new Date(2020, 1, 1).getTime() };
  for (const [b0, count] of [[undated, 2], [twice, 3]] as const) {
    const rr = withRereadStarted(b0, now - 10 * 86_400_000);
    assert.equal(rr.rereading, true);
    const done = finish(rr);
    assert.equal(done.finishedAt, now, 'the reread finish is recorded');
    assert.equal(readCountOf(done), count);
    assert.equal(countFinishesInYear([done], 2026), 1);
    assert.equal('rereading' in done && done.rereading !== undefined, false, 'marker cleared on finish');
    // re-saving the last page afterwards is not another read
    assert.deepEqual(finishFields(done, now + 1000), { finishedAt: now });
  }
  // without a reread, an undated "read" still gets no invented date or extra count
  assert.deepEqual(finishFields({ ...undated, status: 'reading' }, now), { finishedAt: undefined });
  // a first finish still counts once
  assert.deepEqual(finishFields({ ...undated, status: 'reading', readCount: undefined }, now), { finishedAt: now, readCount: 1 });
}
console.log('reads (reread marker): all assertions passed');

// ---- a session's progress happens at its own time (1.5.5) ----
import { applyProgress, sessionEnd, withSessionRemoved, finishYear } from '../../src/lib/reads.ts';
import { setDayStartHour } from '../../src/lib/readingDay.ts';
{
  const dec31 = new Date(2025, 11, 31, 22, 0).getTime();
  const reading: any = { id: 'r', title: 'R', authors: [], status: 'reading', currentPage: 250, pageCount: 300, addedAt: 1, startedAt: new Date(2025, 11, 1).getTime(), shelfIds: [], source: 'manual' };
  const s: any = { id: 's', bookId: 'r', startTime: dec31, endTime: dec31 + 3_600_000, durationSeconds: 3600, startPage: 250, endPage: 300, pagesRead: 50, date: '2025-12-31' };
  assert.equal(sessionEnd(s), dec31 + 3_600_000);
  assert.equal(sessionEnd({ startTime: dec31, endTime: 0, durationSeconds: 600 }), dec31 + 600_000);
  assert.equal(sessionEnd({ startTime: 0, endTime: 0, durationSeconds: 600 }), 0);
  const done = applyProgress(reading, 300, sessionEnd(s));
  assert.equal(done.status, 'finished'); assert.equal(done.finishedAt, dec31 + 3_600_000); assert.equal(done.readCount, 1);
  assert.equal(countFinishesInYear([done], 2025), 1, 'a backdated session finishes the book on its own day');
  assert.equal(countFinishesInYear([done], 2026), 0);
  // A finish can't precede the start the book got today.
  const startedToday = applyProgress({ ...reading, startedAt: new Date(2026, 0, 5).getTime() }, 300, sessionEnd(s));
  assert.equal(startedToday.startedAt, startedToday.finishedAt);
  // Leaving want-to-read dates the start at the session too.
  const started = applyProgress({ ...reading, status: 'want_to_read', currentPage: 0, startedAt: undefined }, 40, sessionEnd(s));
  assert.equal(started.status, 'reading'); assert.equal(started.startedAt, sessionEnd(s));
  // Default: now (the "Update progress" path).
  const before = Date.now();
  assert.ok(applyProgress(reading, 300).finishedAt! >= before);
  // finishYear follows the reading day.
  setDayStartHour(4);
  assert.equal(finishYear(new Date(2026, 0, 1, 2, 0).getTime()), 2025);
  setDayStartHour(0);
  assert.equal(finishYear(new Date(2026, 0, 1, 2, 0).getTime()), 2026);
}
console.log('reads (progress at session time): all assertions passed');

// ---- deleting / editing the session that set the page ----
{
  const S = (id: string, startPage: number, endPage: number, start: number): any => ({ id, bookId: 'b', startTime: start, endTime: start + 600_000, durationSeconds: 600, startPage, endPage, pagesRead: endPage - startPage, date: 'x' });
  const t0 = new Date(2026, 5, 1, 20).getTime();
  const day = 86_400_000;
  const s1 = S('1', 0, 100, t0), s2 = S('2', 100, 180, t0 + day), s3 = S('3', 180, 300, t0 + 2 * day);
  const b: any = { id: 'b', title: 'B', authors: [], status: 'reading', currentPage: 180, pageCount: 300, addedAt: 1, startedAt: t0, shelfIds: [], source: 'manual' };
  // Not the frontier: untouched (same object).
  assert.equal(withSessionRemoved(b, s1, [s2]), b);
  assert.equal(withSessionRemoved(b, { ...s2, endPage: undefined }, [s1]), b);
  // The frontier goes: back to what's left.
  assert.equal(withSessionRemoved(b, s2, [s1]).currentPage, 100);
  // Nothing with pages left: back to where the session picked the book up;
  // without even that the page stays (it may have been set by hand)...
  assert.equal(withSessionRemoved(b, s2, []).currentPage, 100);
  assert.equal(withSessionRemoved(b, { ...s2, startPage: undefined }, []), b);
  // ...but never below a start page of what's left.
  assert.equal(withSessionRemoved(b, s2, [s1, { ...s2, id: 'p', startPage: 150, endPage: undefined }]).currentPage, 150);
  // Never forward: the page was corrected down by hand.
  assert.equal(withSessionRemoved({ ...b, currentPage: 150 }, S('x', 0, 150, t0), [s2]).currentPage, 150);
  // The finishing session: finish undone, read uncounted.
  const fin = applyProgress(b, 300, sessionEnd(s3));
  assert.equal(fin.status, 'finished'); assert.equal(fin.readCount, 1);
  const undone = withSessionRemoved(fin, s3, [s1, s2]);
  assert.equal(undone.status, 'reading'); assert.equal(undone.currentPage, 180);
  assert.equal(undone.finishedAt, undefined); assert.equal(undone.readCount, undefined);
  assert.equal(countFinishesInYear([undone], 2026), 0);
  // ...also for a session saved before 1.5.5 (finish stamped when it was logged, later that day).
  const legacy = { ...fin, finishedAt: sessionEnd(s3) + 3_600_000 };
  assert.equal(withSessionRemoved(legacy, s3, [s1, s2]).status, 'reading');
  // A finish that isn't the session's (set by hand a week later, or by status before it): left alone.
  const byHand = { ...fin, finishedAt: sessionEnd(s3) + 7 * day };
  assert.equal(withSessionRemoved(byHand, s3, [s1, s2]), byHand);
  const byStatus = { ...fin, finishedAt: t0 - day };
  assert.equal(withSessionRemoved(byStatus, s3, [s1, s2]), byStatus);
  // Without a page count a finished book just gets its page back.
  assert.equal(withSessionRemoved({ ...fin, pageCount: undefined }, s3, [s1, s2]).currentPage, 180);
  // A reread: the previous read stays banked, the reread stays open.
  const again = withRereadStarted(fin, t0 + 10 * day);
  const s4 = S('4', 0, 300, t0 + 11 * day);
  const refin = applyProgress(again, 300, sessionEnd(s4));
  assert.equal(refin.readCount, 2); assert.equal(refin.reads!.length, 1);
  const reundone = withSessionRemoved(refin, s4, []);
  assert.equal(reundone.status, 'reading'); assert.equal(reundone.readCount, 1);
  assert.equal(reundone.reads!.length, 1); assert.equal(reundone.rereading, undefined);
  assert.equal(countFinishesInYear([reundone], 2026), 1, 'the first read is still counted');
  assert.deepEqual(finishFields(reundone, t0 + 12 * day), { finishedAt: t0 + 12 * day, readCount: 2 }, 'finishing again counts again');
  // An imported count above the dated history: the reread stays an open reread.
  const floor: any = { ...b, status: 'finished', currentPage: 300, readCount: 2, finishedAt: undefined };
  const rrFin = applyProgress(withRereadStarted(floor, t0), 300, sessionEnd(s4));
  assert.equal(rrFin.readCount, 3);
  const rrUndone = withSessionRemoved(rrFin, s4, []);
  assert.equal(rrUndone.readCount, 2); assert.equal(rrUndone.rereading, true); assert.equal(rrUndone.status, 'reading');
  assert.equal(finishFields(rrUndone, t0 + 12 * day).readCount, 3, 'finishing again counts again');
}
console.log('reads (session removed): all assertions passed');

// ---- the finishing session moved to another day: the finish follows ----
import { withFinishMoved } from '../../src/lib/reads.ts';
{
  const t0 = new Date(2026, 5, 3, 20).getTime();
  const day = 86_400_000;
  const S = (start: number): any => ({ id: 'f', bookId: 'b', startTime: start, endTime: start + 600_000, durationSeconds: 600, startPage: 280, endPage: 300, pagesRead: 20, date: 'x' });
  const b: any = { id: 'b', title: 'B', authors: [], status: 'reading', currentPage: 280, pageCount: 300, addedAt: 1, startedAt: t0 - 5 * day, shelfIds: [], source: 'manual' };
  const old = S(t0);
  const fin = applyProgress(b, 300, sessionEnd(old));
  const moved = withFinishMoved(fin, old, S(t0 - day), sessionEnd(S(t0 - day)));
  assert.equal(moved.finishedAt, sessionEnd(S(t0 - day)));
  assert.equal(moved.readCount, 1, 'still one read');
  // Moved before the book's start: the start follows too.
  assert.equal(withFinishMoved(fin, old, S(t0 - 9 * day), sessionEnd(S(t0 - 9 * day))).startedAt, sessionEnd(S(t0 - 9 * day)));
  // Same moment, a finish set by hand, or no longer the last page: untouched.
  assert.equal(withFinishMoved(fin, old, old, sessionEnd(old)), fin);
  const byHand = { ...fin, finishedAt: t0 + 7 * day };
  assert.equal(withFinishMoved(byHand, old, S(t0 - day), sessionEnd(S(t0 - day))), byHand);
  assert.equal(withFinishMoved(fin, old, { ...S(t0 - day), endPage: 290 }, sessionEnd(S(t0 - day))), fin);
}
console.log('reads (finish moved): all assertions passed');
