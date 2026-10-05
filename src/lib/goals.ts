// Goals: normalisation of stored/imported goals and progress maths. Pure
// (type-only app imports) so the check scripts run it under plain Node.
//
// A goal is a metric (books, pages, minutes) over a period. day/month/year
// recur - the current one is tracked and the goal carries over - while a
// custom goal is a one-off challenge between two dates.
import type { Book, Goal, GoalMetric, GoalPeriod, GoalType, ReadingSession } from '@/types';
import { finishesOf } from './reads.ts';
import { dateKeyToDate, toDateKey } from './utils.ts';
import { readingDayKey, sessionDay } from './readingDay.ts';

export const GOAL_METRICS: GoalMetric[] = ['books', 'pages', 'minutes'];
export const GOAL_PERIODS: GoalPeriod[] = ['day', 'month', 'year', 'custom'];

/** Books per day isn't a meaningful goal; every other pairing is offered. */
export function isValidPairing(metric: GoalMetric, period: GoalPeriod): boolean {
  return !(metric === 'books' && period === 'day');
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The pre-1.4 kind of a goal, kept on disk so older versions still show it. */
export function legacyTypeOf(metric: GoalMetric, period: GoalPeriod): GoalType | undefined {
  if (metric === 'books' && period === 'year') return 'books_per_year';
  if (metric === 'pages' && period === 'day') return 'pages_per_day';
  if (metric === 'minutes' && period === 'day') return 'minutes_per_day';
  return undefined;
}

const FROM_LEGACY: Record<GoalType, { metric: GoalMetric; period: GoalPeriod }> = {
  books_per_year: { metric: 'books', period: 'year' },
  pages_per_day: { metric: 'pages', period: 'day' },
  minutes_per_day: { metric: 'minutes', period: 'day' },
};

/** Coerce an untrusted/legacy goal into the current shape, or null. */
export function normalizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  let metric = r.metric as GoalMetric;
  let period = r.period as GoalPeriod;
  if (!GOAL_METRICS.includes(metric) || !GOAL_PERIODS.includes(period)) {
    const legacy = FROM_LEGACY[r.type as GoalType];
    if (!legacy) return null;
    ({ metric, period } = legacy);
  }
  if (!isValidPairing(metric, period)) return null;
  const target = typeof r.target === 'number' && Number.isFinite(r.target) ? Math.max(0, Math.round(r.target)) : 0;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const goal: Goal = {
    id,
    metric,
    period,
    target,
    createdAt: num(r.createdAt) ?? Date.now(),
  };
  const year = num(r.year);
  if (year != null) goal.year = Math.floor(year);
  const updatedAt = num(r.updatedAt);
  if (updatedAt != null && updatedAt <= Date.now() + 86_400_000) goal.updatedAt = updatedAt;
  if (period === 'custom') {
    const start = typeof r.start === 'string' && DATE_KEY.test(r.start) ? r.start : undefined;
    const end = typeof r.end === 'string' && DATE_KEY.test(r.end) ? r.end : undefined;
    if (!start || !end || end < start) return null;
    goal.start = start;
    goal.end = end;
    if (typeof r.name === 'string' && r.name.trim()) goal.name = r.name.trim();
  }
  const type = legacyTypeOf(metric, period);
  if (type) goal.type = type;
  return goal;
}

/**
 * Normalise a stored goal list: legacy goals are converted, and recurring
 * goals are unique per metric+period. Pre-1.4 "books per year" goals were one
 * per calendar year; now the goal carries over, so the most recent one wins.
 */
export function normalizeGoals(raw: unknown[]): Goal[] {
  const out: Goal[] = [];
  const recurring = new Map<string, Goal>();
  for (const item of raw) {
    const g = normalizeGoal(item);
    if (!g) continue;
    if (g.period === 'custom') {
      out.push(g);
      continue;
    }
    const key = `${g.metric}|${g.period}`;
    const prev = recurring.get(key);
    const rank = (x: Goal) => [x.year ?? 0, x.updatedAt ?? 0, x.createdAt];
    if (!prev || compareTuple(rank(g), rank(prev)) > 0) recurring.set(key, g);
  }
  return [...recurring.values(), ...out];
}

function compareTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export interface GoalWindow {
  /** inclusive local days */
  start: string;
  end: string;
}

/** The days the goal currently counts. */
export function goalWindow(goal: Goal, today: string = readingDayKey()): GoalWindow {
  const y = today.slice(0, 4);
  switch (goal.period) {
    case 'day':
      return { start: today, end: today };
    case 'month': {
      const d = dateKeyToDate(today);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { start: `${today.slice(0, 7)}-01`, end: toDateKey(last.getTime()) };
    }
    case 'year':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'custom':
      return { start: goal.start ?? today, end: goal.end ?? today };
  }
}

/** Days from `a` to `b` inclusive (1 when equal, 0 when b < a). DST-safe. */
export function daysInclusive(a: string, b: string): number {
  if (b < a) return 0;
  return Math.round((dateKeyToDate(b).getTime() - dateKeyToDate(a).getTime()) / 86_400_000) + 1;
}

/** Amount of `metric` read inside the window. */
export function measure(
  metric: GoalMetric,
  win: GoalWindow,
  books: Book[],
  sessions: ReadingSession[]
): number {
  if (metric === 'books') {
    let n = 0;
    for (const b of books) {
      for (const r of finishesOf(b)) {
        const k = readingDayKey(r.finishedAt);
        if (k >= win.start && k <= win.end) n++;
      }
    }
    return n;
  }
  let pages = 0;
  let seconds = 0;
  for (const s of sessions) {
    const day = sessionDay(s);
    if (day < win.start || day > win.end) continue;
    pages += s.pagesRead || 0;
    seconds += s.durationSeconds;
  }
  return metric === 'pages' ? pages : Math.round(seconds / 60);
}

export type GoalState = 'upcoming' | 'active' | 'done' | 'ended';
export type Pace = 'ahead' | 'on_track' | 'behind';

export interface GoalProgress {
  goal: Goal;
  window: GoalWindow;
  current: number;
  state: GoalState;
  /** days left in the window including today (0 once it ended) */
  daysLeft: number;
  /** multi-day windows only: where you are against an even spread */
  pace?: Pace;
  /** multi-day windows only: signed difference to the even-spread amount
   *  expected by the end of today (positive = ahead) */
  delta?: number;
  /** what's still needed per remaining day (incl. today) to make it */
  perDay?: number;
}

export function goalProgress(
  goal: Goal,
  books: Book[],
  sessions: ReadingSession[],
  today: string = readingDayKey()
): GoalProgress {
  const win = goalWindow(goal, today);
  const current = measure(goal.metric, win, books, sessions);
  const total = daysInclusive(win.start, win.end);
  const done = goal.target > 0 && current >= goal.target;
  let state: GoalState;
  if (today < win.start) state = 'upcoming';
  else if (done) state = 'done';
  else if (today > win.end) state = 'ended';
  else state = 'active';
  const daysLeft = today > win.end ? 0 : daysInclusive(today < win.start ? win.start : today, win.end);
  const res: GoalProgress = { goal, window: win, current, state, daysLeft };
  if (state === 'active' && total > 1) {
    const elapsed = daysInclusive(win.start, today);
    const expected = (goal.target * elapsed) / total;
    // Round towards whole units: "half a book behind" reads as noise.
    const delta = Math.round(current - expected);
    res.delta = delta;
    // A tolerance of ~one day's worth keeps "behind" from flashing on
    // every morning before you've read.
    const slack = Math.max(goal.target / total, goal.metric === 'books' ? 0.5 : 1);
    res.pace = current - expected >= slack ? 'ahead' : expected - current > slack ? 'behind' : 'on_track';
    res.perDay = Math.max(0, goal.target - current) / Math.max(1, daysLeft);
  }
  return res;
}
