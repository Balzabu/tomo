import assert from 'node:assert/strict';
import {
  atReadingDay,
  dayStartLabel,
  nextDayRollover,
  placeOnReadingDay,
  readingDayKey,
  readingDayStart,
  sessionDay,
  setDayStartHour,
  adoptStoredDayStartHour,
  getDayStartHour,
} from '../../src/lib/readingDay.ts';
import { goalProgress } from '../../src/lib/goals.ts';
import { planProgress, readingCurve } from '../../src/lib/plan.ts';
import { reminderDays } from '../../src/lib/reminderPlan.ts';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const S = (start: number, mins: number, pages = 10): any => ({
  id: String(start),
  bookId: 'b',
  startTime: start,
  endTime: start + mins * 60_000,
  durationSeconds: mins * 60,
  pagesRead: pages,
  date: 'stale',
});

// --- midnight (the default) ---------------------------------------------
setDayStartHour(0);
{
  assert.equal(readingDayKey(at(2026, 10, 4, 23, 30)), '2026-10-04');
  assert.equal(readingDayKey(at(2026, 10, 5, 0, 30)), '2026-10-05');
  // A session crossing midnight counts for the evening it started on - the
  // bug this module fixes (it used to land on the day it ended).
  assert.equal(sessionDay(S(at(2026, 10, 4, 23, 30), 60)), '2026-10-04');
  assert.equal(sessionDay(S(at(2026, 10, 5, 0, 10), 50)), '2026-10-05');
  // Old backups without a start time keep their stored day.
  assert.equal(sessionDay({ startTime: 0, date: '2026-01-02' }), '2026-01-02');
  assert.equal(nextDayRollover(at(2026, 10, 4, 23, 30)), at(2026, 10, 5, 0));
  assert.equal(dayStartLabel(0, 'Mezzanotte'), 'Mezzanotte');
  assert.equal(dayStartLabel(4, 'Mezzanotte'), '04:00');
}

// --- day ends at 04:00 ----------------------------------------------------
setDayStartHour(4);
{
  assert.equal(getDayStartHour(), 4);
  assert.equal(readingDayKey(at(2026, 10, 5, 0, 30)), '2026-10-04', '00:30 is still Sunday night');
  assert.equal(readingDayKey(at(2026, 10, 5, 3, 59)), '2026-10-04');
  assert.equal(readingDayKey(at(2026, 10, 5, 4, 0)), '2026-10-05');
  // The memo is keyed on the hour: changing it re-buckets the same session.
  const late = S(at(2026, 10, 5, 0, 10), 50);
  assert.equal(sessionDay(late), '2026-10-04');
  assert.equal(sessionDay(S(at(2026, 10, 5, 3, 30), 90)), '2026-10-04', '03:30-05:00 counts for the night before');
  assert.equal(readingDayStart('2026-10-04'), at(2026, 10, 4, 4));
  assert.equal(nextDayRollover(at(2026, 10, 5, 1)), at(2026, 10, 5, 4));
  assert.equal(nextDayRollover(at(2026, 10, 5, 5)), at(2026, 10, 6, 4));
  // Times before the start hour fall on the next calendar date.
  assert.equal(atReadingDay('2026-10-04', 0, 30), at(2026, 10, 5, 0, 30));
  assert.equal(atReadingDay('2026-10-04', 23, 58), at(2026, 10, 4, 23, 58));
  assert.equal(atReadingDay(new Date(2026, 9, 4).getTime(), 12), at(2026, 10, 4, 12));
  setDayStartHour(0);
  assert.equal(sessionDay(late), '2026-10-05', 'back to midnight: the session moves back');
  setDayStartHour(4);
  assert.equal(sessionDay(late), '2026-10-04');
}

// --- placing a session by hand ------------------------------------------
setDayStartHour(4);
{
  const now = at(2026, 10, 5, 0, 30); // Sunday's reading day, past midnight
  // 45 minutes "today" at noon would end in the future: it moves earlier.
  const p = placeOnReadingDay('2026-10-04', at(2026, 10, 4, 12), 45 * 60_000, now);
  assert.equal(p.startTime, at(2026, 10, 4, 12));
  assert.equal(p.endTime, at(2026, 10, 4, 12, 45));
  const q = placeOnReadingDay('2026-10-04', atReadingDay('2026-10-04', 0, 20), 30 * 60_000, now);
  assert.equal(q.startTime, at(2026, 10, 5, 0, 0), 'ends now at the latest');
  assert.equal(q.endTime, now);
  assert.equal(readingDayKey(q.startTime), '2026-10-04');
  // Longer than the day so far: starts at the day start, ends now - still on the chosen day.
  const r = placeOnReadingDay('2026-10-04', at(2026, 10, 4, 12), 24 * 60 * 60_000, now);
  assert.equal(r.startTime, at(2026, 10, 4, 4));
  assert.equal(r.endTime, now);
  // A past day keeps the preferred time untouched.
  const old = placeOnReadingDay('2026-09-01', at(2026, 9, 1, 21, 15), 40 * 60_000, now);
  assert.deepEqual(old, { startTime: at(2026, 9, 1, 21, 15), endTime: at(2026, 9, 1, 21, 55) });
}

// --- goals, plan and curve follow the reading day ------------------------
setDayStartHour(4);
{
  const sessions = [S(at(2026, 10, 4, 23, 30), 60, 20), S(at(2026, 10, 5, 1, 0), 30, 15), S(at(2026, 10, 5, 9, 0), 30, 5)];
  const goal: any = { id: 'g', metric: 'pages', period: 'day', target: 30 };
  assert.equal(goalProgress(goal, [], sessions, '2026-10-04').current, 35, 'Sunday night incl. 01:00');
  assert.equal(goalProgress(goal, [], sessions, '2026-10-05').current, 5);
  setDayStartHour(0);
  assert.equal(goalProgress(goal, [], sessions, '2026-10-04').current, 20, 'midnight: only the 23:30 session');
  assert.equal(goalProgress(goal, [], sessions, '2026-10-05').current, 20);
  setDayStartHour(4);
  const book: any = {
    id: 'b', title: 'x', authors: [], pageCount: 300, currentPage: 40, status: 'reading',
    startedAt: at(2026, 10, 5, 0, 10), plan: { target: '2026-10-20', start: '2026-10-04', startPage: 0 },
  };
  const curve = readingCurve(book, [S(at(2026, 10, 5, 0, 20), 30, 40)].map((s) => ({ ...s, startPage: 0, endPage: 40 })));
  assert.deepEqual(curve.map((p) => p.date), ['2026-10-04'], 'started at 00:10 = Sunday, so the 00:20 session is in');
  assert.equal(planProgress(book, [S(at(2026, 10, 5, 0, 20), 30, 40)], '2026-10-04')!.todayRead, 40);
}

// --- reminders ------------------------------------------------------------
setDayStartHour(4);
{
  // 01:00 on Monday is still Sunday: having read on Sunday skips nothing on
  // Monday's calendar day - the 20:00 reminder belongs to Monday's reading day.
  const r = reminderDays(20, 0, true, new Date(2026, 9, 5, 1, 0), 2);
  assert.deepEqual(r.map((x) => x.day), ['2026-10-05', '2026-10-06']);
  // A 00:30 reminder belongs to the evening before.
  const late = reminderDays(0, 30, false, new Date(2026, 9, 4, 12, 0), 2);
  assert.deepEqual(late.map((x) => x.day), ['2026-10-04', '2026-10-05']);
  const lateRead = reminderDays(0, 30, true, new Date(2026, 9, 4, 12, 0), 2);
  assert.deepEqual(lateRead.map((x) => x.day), ['2026-10-05', '2026-10-06'], 'read today: tonight’s 00:30 is skipped');
}

// --- DST: the hour is a wall-clock hour on 23h/25h days -------------------
setDayStartHour(4);
{
  // EU fall back (Oct 25 2026) and spring forward (Mar 29 2026).
  assert.equal(readingDayKey(at(2026, 10, 25, 2, 30)), '2026-10-24');
  assert.equal(readingDayKey(at(2026, 10, 25, 4, 30)), '2026-10-25');
  assert.equal(readingDayKey(at(2026, 3, 29, 3, 30)), '2026-03-28');
  assert.equal(new Date(nextDayRollover(at(2026, 10, 24, 22))).getHours(), 4);
  assert.equal(new Date(nextDayRollover(at(2026, 3, 28, 22))).getHours(), 4);
}

// --- the widgets' copy never overrides the settings store ----------------
setDayStartHour(2);
adoptStoredDayStartHour(5);
assert.equal(getDayStartHour(), 2, 'the settings store wins in its runtime');
setDayStartHour(9 as number);
assert.equal(getDayStartHour(), 0, 'invalid hours fall back to midnight');

setDayStartHour(0);
console.log('readingDay: all assertions passed');
