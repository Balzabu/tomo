// Reading plans ("finish by …") and per-book reading curves. Pure (type-only
// app imports) so the check scripts run it under plain Node.
import type { Book, ReadingSession } from '@/types';
import { dateKeyToDate } from './utils.ts';
import { readingDayKey, sessionDay } from './readingDay.ts';

function daysBetween(a: string, b: string): number {
  return Math.round((dateKeyToDate(b).getTime() - dateKeyToDate(a).getTime()) / 86_400_000);
}

export type PlanStatus = 'ahead' | 'on_track' | 'behind' | 'overdue' | 'done';

export interface PlanProgress {
  target: string;
  /** days left including today (0 once the deadline has passed) */
  daysLeft: number;
  pagesLeft: number;
  /** today's quota: what's left as of this morning spread over the days left,
   *  so it is recomputed once per day and doesn't move while you read */
  todayTarget: number;
  /** pages read today (towards the quota) */
  todayRead: number;
  status: PlanStatus;
  /** pages ahead (positive) or behind (negative) of an even schedule */
  delta: number;
}

/**
 * Where a book stands against its reading plan. The schedule is linear from
 * the day the plan was set to the deadline; you're "on track" while you're at
 * least where you should have been by the end of yesterday, "ahead" once
 * you've already covered today's share.
 */
export function planProgress(book: Book, sessions: ReadingSession[], today: string = readingDayKey()): PlanProgress | null {
  const plan = book.plan;
  if (!plan || !book.pageCount || book.pageCount <= 0) return null;
  const total = book.pageCount;
  const current = Math.min(book.currentPage, total);
  const pagesLeft = Math.max(0, total - current);
  let todayRead = 0;
  for (const s of sessions) if (s.bookId === book.id && sessionDay(s) === today) todayRead += s.pagesRead || 0;
  todayRead = Math.min(todayRead, Math.max(0, current - plan.startPage));
  const daysLeft = today > plan.target ? 0 : daysBetween(today, plan.target) + 1;
  const leftThisMorning = pagesLeft + todayRead;
  const res: PlanProgress = {
    target: plan.target,
    daysLeft,
    pagesLeft,
    todayTarget: daysLeft > 0 ? Math.ceil(leftThisMorning / daysLeft) : pagesLeft,
    todayRead,
    status: 'on_track',
    delta: 0,
  };
  if (book.status === 'finished' || pagesLeft === 0) {
    res.status = 'done';
    res.todayTarget = 0;
    return res;
  }
  if (daysLeft === 0) {
    res.status = 'overdue';
    res.delta = -pagesLeft;
    return res;
  }
  const span = Math.max(1, daysBetween(plan.start, plan.target) + 1);
  const elapsed = Math.max(0, Math.min(span, daysBetween(plan.start, today))); // full days before today
  const perDay = (total - plan.startPage) / span;
  const expectedYesterday = plan.startPage + perDay * elapsed;
  const expectedToday = plan.startPage + perDay * (elapsed + 1);
  if (current >= expectedToday) {
    res.status = 'ahead';
    res.delta = Math.round(current - expectedToday);
  } else if (current >= expectedYesterday - 0.5) {
    res.status = 'on_track';
    res.delta = 0;
  } else {
    res.status = 'behind';
    res.delta = -Math.round(expectedYesterday - current);
  }
  return res;
}

export interface CurvePoint {
  /** local day */
  date: string;
  /** page reached by the end of that day */
  page: number;
}

/**
 * Page reached per reading day for the current read of a book (sessions since
 * it was started), for the progress curve. Uses a session's end page when it
 * has one, otherwise adds its pages to the running total; never goes
 * backwards.
 */
export function readingCurve(book: Book, sessions: ReadingSession[]): CurvePoint[] {
  const since = book.startedAt ? readingDayKey(book.startedAt) : '';
  const own = sessions
    .filter((s) => s.bookId === book.id && sessionDay(s) >= since)
    .sort((a, b) => a.startTime - b.startTime);
  if (own.length === 0) return [];
  const first = own[0];
  let page = first.startPage ?? Math.max(0, (first.endPage ?? 0) - (first.pagesRead || 0));
  const out: CurvePoint[] = [{ date: sessionDay(first), page }];
  for (const s of own) {
    const next = s.endPage != null ? s.endPage : page + (s.pagesRead || 0);
    page = Math.max(page, next);
    if (book.pageCount) page = Math.min(page, book.pageCount);
    const last = out[out.length - 1];
    const day = sessionDay(s);
    if (last.date === day) last.page = page;
    else out.push({ date: day, page });
  }
  // A lone first point equal to the start carries no shape.
  if (out.length >= 2 && out[0].page === out[1].page && out[0].date === out[1].date) out.shift();
  return out;
}

export interface ReadStats {
  start?: string;
  end?: string;
  days?: number;
  pages: number;
  seconds: number;
  sessions: number;
  readingDays: number;
}

/** Totals for a finished read (the memory card). */
export function readStats(book: Book, sessions: ReadingSession[]): ReadStats {
  const since = book.startedAt ? readingDayKey(book.startedAt) : '';
  const until = book.finishedAt ? readingDayKey(book.finishedAt) : '9999';
  const own = sessions.filter((s) => {
    if (s.bookId !== book.id) return false;
    const day = sessionDay(s);
    return day >= since && day <= until;
  });
  const days = new Set(own.map(sessionDay));
  const start = book.startedAt ? readingDayKey(book.startedAt) : undefined;
  const end = book.finishedAt ? readingDayKey(book.finishedAt) : undefined;
  return {
    start,
    end,
    days: start && end ? daysBetween(start, end) + 1 : undefined,
    pages: book.pageCount ?? own.reduce((n, s) => n + (s.pagesRead || 0), 0),
    seconds: own.reduce((n, s) => n + s.durationSeconds, 0),
    sessions: own.length,
    readingDays: days.size,
  };
}
