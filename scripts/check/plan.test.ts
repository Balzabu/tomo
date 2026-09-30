import assert from 'node:assert/strict';
import { planProgress, readingCurve, readStats } from '../../src/lib/plan.ts';

const at = (d: string, h = 12) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, h).getTime(); };
const B = (extra: any = {}): any => ({ id: 'b', title: 'T', authors: [], status: 'reading', currentPage: 0, pageCount: 300, addedAt: 1, shelfIds: [], source: 'manual', ...extra });
const S = (date: string, pages: number, endPage?: number, secs = 600): any => ({ id: date + pages, bookId: 'b', startTime: at(date), endTime: at(date) + secs * 1000, durationSeconds: secs, pagesRead: pages, endPage, date });

// 300 pages from page 0, Sep 1 → Sep 30 (30 days) = 10/day
const plan = { target: '2026-09-30', start: '2026-09-01', startPage: 0 };
{
  assert.equal(planProgress(B(), [], '2026-09-10'), null, 'no plan');
  assert.equal(planProgress(B({ plan, pageCount: undefined }), [], '2026-09-10'), null, 'no length');
  // Sep 10 morning: should be at 90 by end of yesterday
  const on = planProgress(B({ plan, currentPage: 90 }), [], '2026-09-10')!;
  assert.equal(on.status, 'on_track'); assert.equal(on.daysLeft, 21); assert.equal(on.todayTarget, 10); assert.equal(on.pagesLeft, 210);
  const behind = planProgress(B({ plan, currentPage: 50 }), [], '2026-09-10')!;
  assert.equal(behind.status, 'behind'); assert.equal(behind.delta, -40); assert.equal(behind.todayTarget, 12);
  // read 20 today → 110 ≥ 100 expected by tonight → ahead; quota uses this morning's pages left
  const ahead = planProgress(B({ plan, currentPage: 110 }), [S('2026-09-10', 20, 110)], '2026-09-10')!;
  assert.equal(ahead.status, 'ahead'); assert.equal(ahead.delta, 10); assert.equal(ahead.todayRead, 20); assert.equal(ahead.todayTarget, 10);
  const over = planProgress(B({ plan, currentPage: 250 }), [], '2026-10-02')!;
  assert.equal(over.status, 'overdue'); assert.equal(over.daysLeft, 0); assert.equal(over.todayTarget, 50);
  const lastDay = planProgress(B({ plan, currentPage: 280 }), [], '2026-09-30')!;
  assert.equal(lastDay.daysLeft, 1); assert.equal(lastDay.todayTarget, 20);
  assert.equal(planProgress(B({ plan, currentPage: 300, status: 'finished' }), [], '2026-09-20')!.status, 'done');
}
// curve
{
  const book = B({ startedAt: at('2026-09-01'), currentPage: 60 });
  const c = readingCurve(book, [S('2026-09-03', 20, 45), S('2026-09-01', 25, 25), S('2026-09-03', 5), S('2026-09-05', 10), S('2025-01-01', 99, 99)]);
  assert.equal(c[0].date, '2026-09-01'); assert.equal(c[c.length - 1].page, 60);
  assert.deepEqual(c.map((p) => p.page), [25, 50, 60]);
  assert.deepEqual(readingCurve(B(), []), []);
}
// read stats
{
  const book = B({ status: 'finished', startedAt: at('2026-09-01'), finishedAt: at('2026-09-10'), currentPage: 300 });
  const r = readStats(book, [S('2026-09-01', 100, 100, 3600), S('2026-09-05', 200, 300, 7200), S('2026-08-01', 10, 10)]);
  assert.equal(r.days, 10); assert.equal(r.pages, 300); assert.equal(r.seconds, 10800); assert.equal(r.sessions, 2); assert.equal(r.readingDays, 2);
}
console.log('plan: all assertions passed');
