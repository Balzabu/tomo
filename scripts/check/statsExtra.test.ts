import assert from 'node:assert/strict';
import { ratingDistribution, topAuthors, readingRhythm, slotOfHour, moodPace, yearOverYear, tbrForecast, backlogSpan } from '../../src/lib/statsExtra.ts';

const at = (d: string, h = 12) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, h).getTime(); };
const B = (id: string, extra: any = {}): any => ({ id, title: id, authors: ['A'], status: 'want_to_read', currentPage: 0, addedAt: 1, shelfIds: [], source: 'manual', ...extra });
const fin = (id: string, date: string, extra: any = {}) => B(id, { status: 'finished', finishedAt: at(date), ...extra });
const S = (date: string, hour: number, secs: number, pages = 10): any => ({ id: date + hour, bookId: 'x', startTime: at(date, hour), endTime: at(date, hour) + secs * 1000, durationSeconds: secs, pagesRead: pages, date });

{
  const d = ratingDistribution([fin('a', '2026-01-01', { rating: 4.5 }), fin('b', '2026-01-01', { rating: 5 }), fin('c', '2026-01-01', { rating: 0.5 }), B('d', { rating: 3 })]);
  assert.deepEqual(d.buckets, [1, 0, 0, 1, 1]); assert.equal(d.count, 3); assert.ok(Math.abs(d.avg! - 10 / 3) < 1e-9);
}
{
  const a = topAuthors([fin('1', '2026-01-01', { authors: ['Calvino'], pageCount: 100, rating: 4 }), fin('2', '2026-02-01', { authors: ['Calvino', 'X'], pageCount: 200 }), fin('3', '2026-02-01', { authors: ['Eco'], pageCount: 600 }), B('4', { authors: ['Calvino'] })]);
  assert.equal(a[0].name, 'Calvino'); assert.equal(a[0].books, 2); assert.equal(a[0].pages, 300); assert.equal(a[0].avgRating, 4);
  assert.equal(a[1].name, 'Eco');
}
{
  assert.equal(slotOfHour(0), 'night'); assert.equal(slotOfHour(3), 'late'); assert.equal(slotOfHour(6), 'early'); assert.equal(slotOfHour(22), 'night');
  const r = readingRhythm([S('2026-09-28', 22, 600), S('2026-09-28', 8, 300), S('2026-09-27', 13, 0)]); // Mon, Mon, Sun(untimed)
  assert.equal(r.slots.night, 600); assert.equal(r.slots.morning, 300); assert.equal(r.weekdays[0], 900); assert.equal(r.weekdays[6], 0); assert.equal(r.timedSessions, 2);
}
{
  const m = moodPace([fin('1', '2026-01-01', { moods: ['dark', 'tense'], pace: 'fast' }), fin('2', '2026-01-01', { moods: ['dark'] }), B('3', { moods: ['funny'], pace: 'slow' })]);
  assert.deepEqual(m.moods[0], { mood: 'dark', count: 2 }); assert.equal(m.moods.length, 2); assert.deepEqual(m.pace, { slow: 0, medium: 0, fast: 1 });
}
{
  const books = [fin('1', '2026-03-01', { rating: 4 }), fin('2', '2025-03-01', { rating: 2 }), fin('3', '2025-11-01')];
  const ss = [S('2026-01-05', 20, 600, 30), S('2025-01-05', 20, 300, 10), S('2025-12-05', 20, 300, 99)];
  const y = yearOverYear(books, ss, '2026-09-29');
  assert.equal(y.current.books, 1); assert.equal(y.previous.books, 1, 'Nov 2025 finish is after the same-day cutoff');
  assert.equal(y.current.pages, 30); assert.equal(y.previous.pages, 10); assert.equal(y.previous.avgRating, 2);
  assert.equal(yearOverYear([], [], '2028-02-29').previous.year, 2027);
}
{
  const pile = [B('a', { pageCount: 100 }), B('b', { pageCount: 200 }), B('c')];
  const read = Array.from({ length: 6 }, (_, i) => fin(`f${i}`, `2026-0${i + 1}-10`));
  const f = tbrForecast([...pile, ...read, fin('old', '2024-01-01')], '2026-09-29');
  assert.equal(f.count, 3); assert.equal(f.pages, 300); assert.equal(f.perMonth, 0.5); assert.equal(f.months, 6); assert.equal(f.index, 0.5); assert.equal(f.level, 'healthy');
  assert.ok(f.clearDate! > '2027-03-25' && f.clearDate! < '2027-04-05');
  assert.equal(tbrForecast(pile, '2026-09-29').level, 'unknown');
  assert.equal(tbrForecast(read, '2026-09-29').level, 'empty');
  assert.equal(f.provisional, false, 'a year of history is no estimate');
}
{
  // Tracking since mid-September (2026-10-09 report): 3 books in four weeks
  // is ~3 a month, not 3/12 - one book in the pile lasts days, not months.
  const books = [
    B('pile', { addedAt: at('2026-10-08') }),
    fin('a', '2026-09-19', { startedAt: at('2026-09-12', 14) }),
    fin('b', '2026-09-23', { startedAt: at('2026-09-19') }),
    fin('c', '2026-10-08', { startedAt: at('2026-09-24') }),
  ];
  const f = tbrForecast(books, '2026-10-09');
  // 28 tracked days, measured over the 30-day floor.
  assert.ok(Math.abs(f.perMonth - 3 / (30 / (365.25 / 12))) < 1e-9, String(f.perMonth));
  assert.equal(f.clearDate, '2026-10-19');
  assert.equal(f.level, 'tidy');
  assert.equal(f.provisional, true);
  // The floor: two books finished this week are not eight a month.
  const week = tbrForecast([B('p'), fin('x', '2026-10-05', { startedAt: at('2026-10-03') }), fin('y', '2026-10-08')], '2026-10-09');
  assert.ok(Math.abs(week.perMonth - 2 / (30 / (365.25 / 12))) < 1e-9);
  // Added dates are not history: a whole library imported today, one finish.
  const imported = tbrForecast([B('p', { addedAt: at('2025-01-01') }), fin('x', '2026-10-01', { addedAt: at('2025-01-01') })], '2026-10-09');
  assert.ok(Math.abs(imported.perMonth - 1 / (30 / (365.25 / 12))) < 1e-9);
  // A session before any recorded start widens the window.
  const withSession = tbrForecast(books, '2026-10-09', [S('2026-07-11', 21, 600)]);
  assert.ok(Math.abs(withSession.perMonth - 3 / (91 / (365.25 / 12))) < 1e-9, String(withSession.perMonth));
  assert.equal(withSession.provisional, false);
  // Between three months and a year: the real span, no estimate label.
  const half = tbrForecast([B('p'), fin('x', '2026-04-10', { startedAt: at('2026-04-01') }), fin('y', '2026-09-01')], '2026-09-30');
  assert.ok(Math.abs(half.perMonth - 2 / (183 / (365.25 / 12))) < 1e-9);
  assert.equal(half.provisional, false);
  // Nothing finished yet: no pace, and nothing to call provisional.
  const none = tbrForecast([B('p'), B('r', { status: 'reading', startedAt: at('2026-10-01') })], '2026-10-09');
  assert.equal(none.level, 'unknown'); assert.equal(none.provisional, false);
}
{
  // The backlog reads in the natural unit, not "0.0 years".
  assert.deepEqual(backlogSpan(1 / 3.04), { unit: 'days', value: 10 }, 'one book at ~3 a month');
  assert.deepEqual(backlogSpan(0.001), { unit: 'days', value: 1 }, 'never "0 days" for a pile that exists');
  assert.deepEqual(backlogSpan(0.97), { unit: 'months', value: 1 });
  assert.deepEqual(backlogSpan(4.4), { unit: 'months', value: 4 });
  assert.deepEqual(backlogSpan(11.6), { unit: 'years', value: 1 }, '12 months reads as a year');
  assert.deepEqual(backlogSpan(30), { unit: 'years', value: 2.5 });
}
console.log('statsExtra: all assertions passed');
{
  // a hand-added session (nominal 12:00:00.000) counts for the weekday only
  const r = readingRhythm([S('2026-09-28', 12, 600), S('2026-09-28', 21, 300)]);
  assert.equal(r.slots.afternoon, 0); assert.equal(r.slots.night, 300); assert.equal(r.weekdays[0], 900); assert.equal(r.timedSessions, 1);
}
