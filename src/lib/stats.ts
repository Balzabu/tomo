import { Book, Goal, ReadingSession } from '@/types';
import { toDateKey, dateKeyToDate } from '@/lib/utils';

export interface OverallStats {
  totalBooks: number;
  finishedBooks: number;
  readingBooks: number;
  totalPagesRead: number;
  totalSeconds: number;
  totalSessions: number;
  avgPagesPerHour: number;
  currentStreak: number;
  longestStreak: number;
  finishedThisYear: number;
}

export function computeStats(
  books: Book[],
  sessions: ReadingSession[]
): OverallStats {
  const year = new Date().getFullYear();
  const totalSeconds = sessions.reduce((s, x) => s + x.durationSeconds, 0);
  const totalPagesRead = sessions.reduce((s, x) => s + (x.pagesRead || 0), 0);

  const finishedBooks = books.filter((b) => b.status === 'finished');
  const finishedThisYear = finishedBooks.filter(
    (b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  ).length;

  const hours = totalSeconds / 3600;
  const avgPagesPerHour = hours > 0 ? totalPagesRead / hours : 0;

  const { current, longest } = computeStreaks(sessions);

  return {
    totalBooks: books.length,
    finishedBooks: finishedBooks.length,
    readingBooks: books.filter((b) => b.status === 'reading').length,
    totalPagesRead,
    totalSeconds,
    totalSessions: sessions.length,
    avgPagesPerHour,
    currentStreak: current,
    longestStreak: longest,
    finishedThisYear,
  };
}

/** Map of YYYY-MM-DD -> seconds read that day. */
export function sessionsByDay(sessions: ReadingSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.date, (map.get(s.date) ?? 0) + s.durationSeconds);
  }
  return map;
}

export function pagesByDay(sessions: ReadingSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.date, (map.get(s.date) ?? 0) + (s.pagesRead || 0));
  }
  return map;
}

function computeStreaks(sessions: ReadingSession[]): {
  current: number;
  longest: number;
} {
  if (sessions.length === 0) return { current: 0, longest: 0 };
  const days = Array.from(new Set(sessions.map((s) => s.date))).sort();

  // longest run of consecutive days
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = dateKeyToDate(days[i - 1]).getTime();
    const cur = dateKeyToDate(days[i]).getTime();
    // Round the day gap so DST transitions (23h/25h days) still count as 1 day.
    const dayGap = Math.round((cur - prev) / 86_400_000);
    if (dayGap === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // current streak counts back from today (or yesterday)
  const set = new Set(days);
  let current = 0;
  let cursor = new Date();
  let key = toDateKey(cursor.getTime());
  if (!set.has(key)) {
    // allow streak to be "alive" if you read yesterday but not yet today
    cursor.setDate(cursor.getDate() - 1); // calendar step (DST-safe)
    key = toDateKey(cursor.getTime());
    if (!set.has(key)) return { current: 0, longest };
  }
  while (set.has(key)) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1); // calendar step (DST-safe)
    key = toDateKey(cursor.getTime());
  }
  return { current, longest };
}

export interface HeatCell {
  date: string;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** Last `weeks` weeks of activity, aligned to week columns (Mon-first). */
export function buildHeatmap(
  sessions: ReadingSession[],
  weeks = 17
): { cells: HeatCell[]; cols: number } {
  const byDay = sessionsByDay(sessions);
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - dow);
  lastMonday.setHours(0, 0, 0, 0);

  const start = new Date(lastMonday);
  start.setDate(lastMonday.getDate() - (weeks - 1) * 7);

  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i); // calendar step (DST-safe)
    const key = toDateKey(d.getTime());
    cells.push({ date: key, seconds: byDay.get(key) ?? 0, level: 0 });
  }
  // Normalise intensity against the busiest day *in view*, not all-time, so a
  // single historic marathon day doesn't dim every recent cell.
  const max = Math.max(1, ...cells.map((c) => c.seconds));
  for (const cell of cells) {
    if (cell.seconds > 0) {
      const ratio = cell.seconds / max;
      cell.level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
  }
  return { cells, cols: weeks };
}

/** Estimate the reading time left for a book from its own pace (falling back to
 *  the global average pages/hour). Returns null if not estimable. */
export function estimateRemaining(
  book: Book,
  sessions: ReadingSession[]
): { pagesLeft: number; secondsLeft: number } | null {
  if (!book.pageCount || book.pageCount <= 0) return null;
  const pagesLeft = book.pageCount - book.currentPage;
  if (pagesLeft <= 0) return null;

  const bookSessions = sessions.filter((s) => s.bookId === book.id);
  let pages = bookSessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0);
  let seconds = bookSessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  // fall back to global pace if this book has too little data
  if (pages < 5 || seconds < 60) {
    pages = sessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0);
    seconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  }
  if (pages < 5 || seconds < 60) return null;

  const secondsPerPage = seconds / pages;
  return { pagesLeft, secondsLeft: Math.round(pagesLeft * secondsPerPage) };
}

export interface Insights {
  fastestBook?: { title: string; pagesPerHour: number };
  topCategory?: { name: string; count: number };
  pagesThisMonth: number;
  pagesLastMonth: number;
  thisYearFinished: number;
}

/** A few "fun fact" insights for the stats screen. */
export function computeInsights(books: Book[], sessions: ReadingSession[]): Insights {
  const now = new Date();
  const year = now.getFullYear();
  const thisMonthKey = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(year, now.getMonth() - 1, 1);
  const lastMonthKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;

  let pagesThisMonth = 0;
  let pagesLastMonth = 0;
  for (const s of sessions) {
    const ym = s.date.slice(0, 7);
    if (ym === thisMonthKey) pagesThisMonth += s.pagesRead || 0;
    else if (ym === lastMonthKey) pagesLastMonth += s.pagesRead || 0;
  }

  // fastest finished book by pages/hour (needs ≥30 min and ≥20 pages logged)
  const byBook = new Map<string, { pages: number; seconds: number }>();
  for (const s of sessions) {
    const e = byBook.get(s.bookId) ?? { pages: 0, seconds: 0 };
    e.pages += s.pagesRead || 0;
    e.seconds += s.durationSeconds;
    byBook.set(s.bookId, e);
  }
  let fastestBook: Insights['fastestBook'];
  for (const b of books) {
    const e = byBook.get(b.id);
    if (!e || e.seconds < 1800 || e.pages < 20) continue;
    const pph = e.pages / (e.seconds / 3600);
    if (!fastestBook || pph > fastestBook.pagesPerHour) {
      fastestBook = { title: b.title, pagesPerHour: Math.round(pph) };
    }
  }

  // most-read category among finished books
  const catCount = new Map<string, number>();
  for (const b of books) {
    if (b.status !== 'finished') continue;
    for (const cat of b.categories ?? []) {
      const name = cat.split('/')[0].trim();
      if (name) catCount.set(name, (catCount.get(name) ?? 0) + 1);
    }
  }
  let topCategory: Insights['topCategory'];
  for (const [name, count] of catCount) {
    if (!topCategory || count > topCategory.count) topCategory = { name, count };
  }

  const thisYearFinished = books.filter(
    (b) => b.status === 'finished' && b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  ).length;

  return { fastestBook, topCategory, pagesThisMonth, pagesLastMonth, thisYearFinished };
}

export interface YearWrapped {
  year: number;
  booksFinished: number;
  pagesRead: number;
  secondsRead: number;
  sessions: number;
  longestStreak: number;
  avgRating?: number;
  topAuthor?: { name: string; count: number };
  busiestMonth?: number; // 0-11, or undefined
  longestBook?: { title: string; pages: number };
  topMoods: string[];
}

/**
 * Whether the "year in books" wrapped should be offered. Gated by reading
 * activity in the year (not account age), so new/sporadic users don't see a
 * thin summary.
 */
export function isWrappedAvailable(
  books: Book[],
  sessions: ReadingSession[],
  year: number
): boolean {
  const prefix = `${year}-`;
  const finishedThisYear = books.filter(
    (b) => b.status === 'finished' && b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  ).length;
  const sessionsThisYear = sessions.filter((s) => s.date.startsWith(prefix)).length;
  return finishedThisYear >= 3 || sessionsThisYear >= 15;
}

/** Aggregate a year's reading into a shareable "wrapped" summary. */
export function computeYearWrapped(
  books: Book[],
  sessions: ReadingSession[],
  year: number
): YearWrapped {
  const prefix = `${year}-`;
  const yearSessions = sessions.filter((s) => s.date.startsWith(prefix));
  const finished = books.filter(
    (b) => b.status === 'finished' && b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  );

  const pagesRead = yearSessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0);
  const secondsRead = yearSessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  // longest streak within the year
  const days = Array.from(new Set(yearSessions.map((s) => s.date))).sort();
  let longestStreak = days.length > 0 ? 1 : 0;
  let run = days.length > 0 ? 1 : 0;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round(
      (dateKeyToDate(days[i]).getTime() - dateKeyToDate(days[i - 1]).getTime()) / 86_400_000
    );
    run = gap === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const rated = finished.filter((b) => typeof b.rating === 'number' && b.rating > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, b) => sum + (b.rating || 0), 0) / rated.length
    : undefined;

  const authorCount = new Map<string, number>();
  for (const b of finished) {
    const a = b.authors[0];
    if (a) authorCount.set(a, (authorCount.get(a) ?? 0) + 1);
  }
  let topAuthor: YearWrapped['topAuthor'];
  for (const [name, count] of authorCount) {
    if (!topAuthor || count > topAuthor.count) topAuthor = { name, count };
  }

  const monthSeconds = new Array(12).fill(0);
  for (const s of yearSessions) monthSeconds[dateKeyToDate(s.date).getMonth()] += s.durationSeconds;
  const maxMonth = Math.max(...monthSeconds);
  const busiestMonth = maxMonth > 0 ? monthSeconds.indexOf(maxMonth) : undefined;

  let longestBook: YearWrapped['longestBook'];
  for (const b of finished) {
    if (b.pageCount && (!longestBook || b.pageCount > longestBook.pages)) {
      longestBook = { title: b.title, pages: b.pageCount };
    }
  }

  const moodCount = new Map<string, number>();
  for (const b of finished) for (const m of b.moods ?? []) moodCount.set(m, (moodCount.get(m) ?? 0) + 1);
  const topMoods = [...moodCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  return {
    year,
    booksFinished: finished.length,
    pagesRead,
    secondsRead,
    sessions: yearSessions.length,
    longestStreak,
    avgRating,
    topAuthor,
    busiestMonth,
    longestBook,
    topMoods,
  };
}

export interface GoalProgress {
  goal: Goal;
  current: number;
}

// Returns only the raw numbers; labels/units are localized in the UI layer.
export function computeGoalProgress(
  goal: Goal,
  books: Book[],
  sessions: ReadingSession[]
): GoalProgress {
  const todayKey = toDateKey();
  if (goal.type === 'books_per_year') {
    const current = books.filter(
      (b) =>
        b.status === 'finished' &&
        b.finishedAt &&
        new Date(b.finishedAt).getFullYear() === goal.year
    ).length;
    return { goal, current };
  }
  if (goal.type === 'pages_per_day') {
    const current = sessions
      .filter((s) => s.date === todayKey)
      .reduce((sum, s) => sum + (s.pagesRead || 0), 0);
    return { goal, current };
  }
  // minutes_per_day
  const seconds = sessions
    .filter((s) => s.date === todayKey)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
  return { goal, current: Math.round(seconds / 60) };
}

/** Last `n` days of pages read, oldest first - for the bar chart. */
export function recentDailyPages(
  sessions: ReadingSession[],
  n = 7
): { date: string; pages: number; seconds: number }[] {
  const byPages = pagesByDay(sessions);
  const bySec = sessionsByDay(sessions);
  const out: { date: string; pages: number; seconds: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i); // calendar step (DST-safe)
    const key = toDateKey(d.getTime());
    out.push({
      date: key,
      pages: byPages.get(key) ?? 0,
      seconds: bySec.get(key) ?? 0,
    });
  }
  return out;
}
