// Which days get a reading reminder. Pure (type-only app imports) so the
// check scripts run it under plain Node.
import { toDateKey } from './utils.ts';

/** How far ahead one-off reminders are planned. The plan is refreshed every
 *  time the app runs, so this only matters for someone who stops opening it -
 *  and a month of nudges is plenty. */
export const PLAN_DAYS = 30;

/**
 * The next `days` reminder moments at hour:minute, skipping today when it
 * has already been read (or the time has passed).
 */
export function reminderDays(
  hour: number,
  minute: number,
  readToday: boolean,
  now: Date = new Date(),
  days: number = PLAN_DAYS
): { day: string; date: Date }[] {
  const out: { day: string; date: Date }[] = [];
  for (let i = 0; out.length < days && i <= days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (i === 0 && readToday) continue;
    out.push({ day: toDateKey(d.getTime()), date: d });
  }
  return out;
}
