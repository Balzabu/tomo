import assert from 'node:assert/strict';
import { reminderDays } from '../../src/lib/reminderPlan.ts';
const now = new Date(2026, 8, 29, 18, 0); // Sep 29 18:00
{
  const r = reminderDays(20, 30, false, now, 5);
  assert.equal(r.length, 5); assert.equal(r[0].day, '2026-09-29'); assert.equal(r[0].date.getHours(), 20); assert.equal(r[4].day, '2026-10-03');
}
{
  const r = reminderDays(20, 30, true, now, 5);
  assert.equal(r[0].day, '2026-09-30', 'already read today: skip today'); assert.equal(r.length, 5);
}
{
  const r = reminderDays(9, 0, false, now, 3);
  assert.equal(r[0].day, '2026-09-30', 'time passed today'); assert.equal(r.length, 3);
}
{
  const r = reminderDays(20, 0, false, new Date(2026, 2, 28, 12), 3); // across DST (Mar 29 in EU)
  assert.deepEqual(r.map((x) => x.date.getHours()), [20, 20, 20]);
}
console.log('reminderPlan: all assertions passed');
