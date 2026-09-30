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
