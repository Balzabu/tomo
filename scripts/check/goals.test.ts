import assert from 'node:assert/strict';
import { normalizeGoal, normalizeGoals, goalProgress, goalWindow, daysInclusive, legacyTypeOf } from '../../src/lib/goals.ts';

const at = (d: string, h = 12) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, h).getTime(); };
const book = (id: string, finished?: string, reads: string[] = []): any => ({
  id, title: id, authors: [], status: finished ? 'finished' : 'reading', currentPage: 0, addedAt: 1, shelfIds: [], source: 'manual',
  finishedAt: finished ? at(finished) : undefined, reads: reads.map((r) => ({ finishedAt: at(r) })),
});
const sess = (date: string, pages: number, secs: number): any => ({ id: date + pages, bookId: 'b', startTime: at(date), endTime: at(date) + secs * 1000, durationSeconds: secs, pagesRead: pages, date });

// legacy migration
{
  const g = normalizeGoal({ id: 'g1', type: 'books_per_year', target: 24, year: 2025, createdAt: 5 })!;
  assert.equal(g.metric, 'books'); assert.equal(g.period, 'year'); assert.equal(g.target, 24); assert.equal(g.type, 'books_per_year');
  assert.equal(normalizeGoal({ id: 'x', type: 'bogus', target: 3 }), null);
  assert.equal(normalizeGoal({ id: 'x', metric: 'books', period: 'day', target: 3 }), null, 'books/day is not a goal');
  assert.equal(normalizeGoal({ id: 'x', metric: 'pages', period: 'custom', target: 3, start: '2026-02-01', end: '2026-01-01' }), null, 'end before start');
  const c = normalizeGoal({ id: 'c', metric: 'pages', period: 'custom', target: 500, start: '2026-01-01', end: '2026-01-31', name: '  Gennaio  ' })!;
  assert.equal(c.name, 'Gennaio'); assert.equal(c.type, undefined);
  assert.equal(legacyTypeOf('minutes', 'day'), 'minutes_per_day');
}
// dedupe of per-year legacy goals: most recent year wins
{
  const gs = normalizeGoals([
    { id: 'a', type: 'books_per_year', target: 10, year: 2024, createdAt: 1 },
    { id: 'b', type: 'books_per_year', target: 30, year: 2026, createdAt: 2 },
    { id: 'c', type: 'pages_per_day', target: 20, year: 2024, createdAt: 3 },
    { id: 'd', metric: 'pages', period: 'custom', target: 100, start: '2026-01-01', end: '2026-01-10', createdAt: 4 },
  ]);
  assert.equal(gs.length, 3); assert.equal(gs.find((g) => g.metric === 'books')!.target, 30);
}
// windows
{
  assert.deepEqual(goalWindow({ period: 'month' } as any, '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(goalWindow({ period: 'year' } as any, '2026-02-10'), { start: '2026-01-01', end: '2026-12-31' });
  assert.equal(daysInclusive('2026-03-28', '2026-03-30'), 3); // across DST
  assert.equal(daysInclusive('2026-03-30', '2026-03-28'), 0);
}
// progress: books this year incl. rereads, pace
{
  const books = [book('a', '2026-01-10'), book('b', '2026-03-01', ['2026-02-01', '2025-05-01']), book('c')];
  const p = goalProgress({ id: 'g', metric: 'books', period: 'year', target: 12, createdAt: 0 } as any, books, [], '2026-07-01');
  assert.equal(p.current, 3); assert.equal(p.state, 'active'); assert.equal(p.pace, 'behind'); assert.ok(p.delta! < 0);
  assert.equal(p.daysLeft, 184); assert.ok(Math.abs(p.perDay! - 9 / 184) < 1e-9);
  const q = goalProgress({ id: 'g', metric: 'books', period: 'year', target: 4, createdAt: 0 } as any, books, [], '2026-02-01');
  assert.equal(q.pace, 'ahead');
}
// pages/minutes, day + custom challenge states
{
  const ss = [sess('2026-05-01', 30, 1800), sess('2026-05-02', 20, 600), sess('2026-05-03', 10, 60)];
  const day = goalProgress({ id: 'g', metric: 'minutes', period: 'day', target: 30, createdAt: 0 } as any, [], ss, '2026-05-01');
  assert.equal(day.current, 30); assert.equal(day.state, 'done'); assert.equal(day.pace, undefined);
  const ch = { id: 'c', metric: 'pages', period: 'custom', target: 100, start: '2026-05-01', end: '2026-05-02', createdAt: 0 } as any;
  assert.equal(goalProgress(ch, [], ss, '2026-04-20').state, 'upcoming');
  const ended = goalProgress(ch, [], ss, '2026-05-10');
  assert.equal(ended.current, 50); assert.equal(ended.state, 'ended'); assert.equal(ended.daysLeft, 0);
  assert.equal(goalProgress({ ...ch, target: 50 }, [], ss, '2026-05-10').state, 'done');
}
console.log('goals: all assertions passed');
