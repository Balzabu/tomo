// Deeper statistics (distributions, habits, year-over-year, TBR forecast).
// Pure (type-only app imports) so the check scripts run it under plain Node.
import type { Book, ReadingPace, ReadingSession } from '@/types';
import { finishesOf } from './reads.ts';
import { dateKeyToDate, toDateKey } from './utils.ts';
import { readingDayKey, sessionDay } from './readingDay.ts';

/** Ratings of finished books bucketed by whole star (index 0 = 1★ … 4 = 5★).
 *  A half star counts with the whole star below it (4.5 → 4★), 0.5 → 1★. */
export function ratingDistribution(books: Book[]): { buckets: number[]; avg?: number; count: number } {
  const buckets = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const b of books) {
    if (!b.rating || b.rating <= 0 || finishesOf(b).length === 0) continue;
    buckets[Math.min(4, Math.max(0, Math.floor(b.rating) - 1))]++;
    sum += b.rating;
    count++;
  }
  return { buckets, avg: count ? sum / count : undefined, count };
}

export interface AuthorStat {
  name: string;
  books: number;
  pages: number;
  avgRating?: number;
}

/** Most-read authors over finished books (each book once, every author credited). */
export function topAuthors(books: Book[], n = 5): AuthorStat[] {
  const m = new Map<string, { books: number; pages: number; rsum: number; rn: number }>();
  for (const b of books) {
    if (finishesOf(b).length === 0) continue;
    for (const raw of b.authors) {
      const name = raw.trim();
      if (!name) continue;
      const e = m.get(name) ?? { books: 0, pages: 0, rsum: 0, rn: 0 };
      e.books++;
      e.pages += b.pageCount ?? 0;
      if (b.rating && b.rating > 0) {
        e.rsum += b.rating;
        e.rn++;
      }
      m.set(name, e);
    }
  }
  return [...m.entries()]
    .map(([name, e]) => ({ name, books: e.books, pages: e.pages, avgRating: e.rn ? e.rsum / e.rn : undefined }))
    .sort((a, b) => b.books - a.books || b.pages - a.pages || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Time-of-day slots, by local start hour. */
export const DAY_SLOTS = ['early', 'morning', 'afternoon', 'evening', 'night', 'late'] as const;
export type DaySlot = (typeof DAY_SLOTS)[number];
export function slotOfHour(h: number): DaySlot {
  if (h >= 5 && h < 8) return 'early';
  if (h >= 8 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  if (h >= 21 || h < 1) return 'night';
  return 'late'; // 1-5
}

/** Seconds read per time-of-day slot and per weekday (Monday first). Only
 *  timed sessions count - an untimed "update progress" has no real hour. */
export function readingRhythm(sessions: ReadingSession[]): {
  slots: Record<DaySlot, number>;
  weekdays: number[];
  timedSessions: number;
} {
  const slots = Object.fromEntries(DAY_SLOTS.map((s) => [s, 0])) as Record<DaySlot, number>;
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  let timedSessions = 0;
  // Many sessions share a day: parse each date key once.
  const weekdayOf = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationSeconds <= 0) continue;
    // Sessions added by hand get a nominal 12:00:00.000 start - they say
    // nothing about the hour you read, only the weekday.
    const d = new Date(s.startTime);
    const manual = d.getHours() === 12 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
    const day = sessionDay(s);
    let wd = weekdayOf.get(day);
    if (wd === undefined) {
      wd = (dateKeyToDate(day).getDay() + 6) % 7;
      weekdayOf.set(day, wd);
    }
    weekdays[wd] += s.durationSeconds;
    if (manual) continue;
    timedSessions++;
    slots[slotOfHour(d.getHours())] += s.durationSeconds;
  }
  return { slots, weekdays, timedSessions };
}

/** Mood tags and pace of finished books, most frequent first. */
export function moodPace(books: Book[]): { moods: { mood: string; count: number }[]; pace: Record<ReadingPace, number> } {
  const moods = new Map<string, number>();
  const pace: Record<ReadingPace, number> = { slow: 0, medium: 0, fast: 0 };
  for (const b of books) {
    if (finishesOf(b).length === 0) continue;
    for (const m of b.moods ?? []) moods.set(m, (moods.get(m) ?? 0) + 1);
    if (b.pace) pace[b.pace]++;
  }
  return {
    moods: [...moods.entries()].map(([mood, count]) => ({ mood, count })).sort((a, b) => b.count - a.count || a.mood.localeCompare(b.mood)),
    pace,
  };
}

export interface YearTotals {
  year: number;
  books: number;
  pages: number;
  seconds: number;
  sessions: number;
  days: number;
  avgRating?: number;
}

/**
 * This year so far against last year *up to the same day*, so September isn't
 * compared with a whole December-closed year. Feb 29 falls back to Feb 28.
 */
export function yearOverYear(books: Book[], sessions: ReadingSession[], today: string = readingDayKey()): { current: YearTotals; previous: YearTotals } {
  const y = Number(today.slice(0, 4));
  const md = today.slice(5);
  const prevEnd = md === '02-29' ? `${y - 1}-02-28` : `${y - 1}-${md}`;
  const totals = (year: number, end: string): YearTotals => {
    const start = `${year}-01-01`;
    let pages = 0;
    let seconds = 0;
    let n = 0;
    const days = new Set<string>();
    for (const s of sessions) {
      const day = sessionDay(s);
      if (day < start || day > end) continue;
      pages += s.pagesRead || 0;
      seconds += s.durationSeconds;
      n++;
      days.add(day);
    }
    let finished = 0;
    let rsum = 0;
    let rn = 0;
    for (const b of books) {
      let hit = 0;
      for (const r of finishesOf(b)) {
        const k = readingDayKey(r.finishedAt);
        if (k >= start && k <= end) hit++;
      }
      finished += hit;
      if (hit && b.rating && b.rating > 0) {
        rsum += b.rating;
        rn++;
      }
    }
    return { year, books: finished, pages, seconds, sessions: n, days: days.size, avgRating: rn ? rsum / rn : undefined };
  };
  return { current: totals(y, today), previous: totals(y - 1, prevEnd) };
}

export interface TbrForecast {
  /** books waiting to be read (want_to_read) */
  count: number;
  /** their known pages */
  pages: number;
  /** finished books per month over the last 12 months (0 when none) */
  perMonth: number;
  /** months to clear the pile at that pace (undefined when not estimable) */
  months?: number;
  /** local day the pile would be cleared */
  clearDate?: string;
  /** tsundoku index: years of backlog at the current pace */
  index?: number;
  level: 'empty' | 'tidy' | 'healthy' | 'collector' | 'master' | 'unknown';
}

/** How long the to-read pile lasts at your recent pace, and the tsundoku
 *  index (years of backlog). Only the last 12 months count, so an old binge
 *  doesn't promise a pace you no longer have. */
export function tbrForecast(books: Book[], today: string = readingDayKey()): TbrForecast {
  const pile = books.filter((b) => b.status === 'want_to_read');
  const pages = pile.reduce((s, b) => s + (b.pageCount ?? 0), 0);
  const d = dateKeyToDate(today);
  const since = toDateKey(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate(), 12).getTime());
  let finished = 0;
  for (const b of books) for (const r of finishesOf(b)) if (readingDayKey(r.finishedAt) > since) finished++;
  const perMonth = finished / 12;
  const res: TbrForecast = { count: pile.length, pages, perMonth, level: 'unknown' };
  if (pile.length === 0) {
    res.level = 'empty';
    return res;
  }
  if (perMonth <= 0) return res;
  const months = pile.length / perMonth;
  res.months = months;
  res.index = months / 12;
  const clear = new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(months * 30.44), 12);
  res.clearDate = toDateKey(clear.getTime());
  res.level = res.index < 0.25 ? 'tidy' : res.index < 1 ? 'healthy' : res.index < 3 ? 'collector' : 'master';
  return res;
}
