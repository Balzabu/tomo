// The "reading day": the calendar day shifted by a configurable start hour, so
// a night reader's 00:30 still belongs to the evening before. Every day bucket
// in the app (streaks, goals, heatmap, plans, "today") goes through here.
// Pure (type-only app imports) so the check scripts run it under plain Node.
import type { ReadingSession } from '@/types';
import { dateKeyToDate, toDateKey } from './utils.ts';

/** Hours a reading day can start at: midnight (the calendar day) to 6 AM. */
export const DAY_START_HOURS = [0, 1, 2, 3, 4, 5, 6] as const;

let dayStartHour = 0;
// Set once the settings store has applied the hour in this JS runtime: from
// then on a copy read back from disk (the widgets do) can't override it.
let fromSettings = false;
// sessionDay() runs for every session on every stats pass: remember the key
// per start time (cleared whenever the start hour changes).
const dayOfStart = new Map<number, string>();

export function isDayStartHour(h: unknown): h is number {
  return typeof h === 'number' && (DAY_START_HOURS as readonly number[]).includes(h);
}

/** Set the hour reading days start at (from the settings; 0 = midnight). */
export function setDayStartHour(h: number): void {
  fromSettings = true;
  applyHour(h);
}

/**
 * The hour as persisted, for a runtime without the settings store (the
 * headless widget task). Ignored where the settings store already set it: the
 * persisted copy may lag behind a change still being written.
 */
export function adoptStoredDayStartHour(h: unknown): void {
  if (!fromSettings) applyHour(typeof h === 'number' ? h : 0);
}

function applyHour(h: number): void {
  const next = isDayStartHour(h) ? h : 0;
  if (next === dayStartHour) return;
  dayStartHour = next;
  dayOfStart.clear();
}

/** The setting's value as shown: `midnight` for 0, otherwise 01:00…06:00. */
export function dayStartLabel(hour: number, midnight: string): string {
  return hour === 0 ? midnight : `${String(hour).padStart(2, '0')}:00`;
}

export function getDayStartHour(): number {
  return dayStartHour;
}

/** The reading day (YYYY-MM-DD) a moment belongs to (defaults to now). */
export function readingDayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  // Calendar step, not -24h: DST days are 23h/25h long.
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return toDateKey(d.getTime());
}

/**
 * The day a session counts for: the reading day it *started* on, so an evening
 * session running past midnight stays on the evening's day. Sessions without a
 * usable start time (old backups) keep their stored day.
 */
export function sessionDay(s: Pick<ReadingSession, 'startTime' | 'date'>): string {
  if (!(s.startTime > 0)) return s.date;
  let key = dayOfStart.get(s.startTime);
  if (key === undefined) {
    key = readingDayKey(s.startTime);
    if (dayOfStart.size > 50_000) dayOfStart.clear();
    dayOfStart.set(s.startTime, key);
  }
  return key;
}

/** When a reading day starts (its start hour on that calendar date). */
export function readingDayStart(day: string | number): number {
  const d = typeof day === 'string' ? dateKeyToDate(day) : new Date(day);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

/** When the reading day containing `ts` ends (= the next one starts). */
export function nextDayRollover(ts: number = Date.now()): number {
  const d = dateKeyToDate(readingDayKey(ts));
  d.setDate(d.getDate() + 1);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

/**
 * The moment on reading day `day` at a given time of day. Times before the
 * start hour fall on the next calendar date (00:30 of Sunday's reading day is
 * Monday 00:30).
 */
export function atReadingDay(day: string | number, h: number, m = 0, s = 0, ms = 0): number {
  const d = typeof day === 'string' ? dateKeyToDate(day) : new Date(day);
  d.setHours(0, 0, 0, 0);
  if (h < dayStartHour) d.setDate(d.getDate() + 1);
  d.setHours(h, m, s, ms);
  return d.getTime();
}

/**
 * Start and end of a session placed by hand on reading day `day` (the session
 * editor, a recovered timer): at the preferred start, moved earlier so it
 * doesn't end in the future - but never off that day, since the day it starts
 * on is the day it counts for. When it can't fit before now, it ends now.
 */
export function placeOnReadingDay(
  day: string | number,
  preferredStart: number,
  durationMs: number,
  now: number = Date.now()
): { startTime: number; endTime: number } {
  const first = readingDayStart(day);
  const last = nextDayRollover(first) - 1;
  const startTime = Math.min(Math.max(Math.min(preferredStart, now - durationMs), first), last);
  const endTime = Math.min(startTime + durationMs, Math.max(startTime, now));
  return { startTime, endTime };
}
