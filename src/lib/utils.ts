// Small dependency-free helpers shared across the app.

/** Reasonably unique id without pulling in a uuid dependency. */
export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
}

/** Local YYYY-MM-DD for a given timestamp (defaults to now). */
export function toDateKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" (or with "/") typed by hand into a local timestamp at
 *  noon (DST-safe), or null when it isn't a real calendar date. Local, not
 *  Date.parse: a bare date parses as UTC midnight and slips a day in
 *  negative-offset zones. */
export function parseLocalDateKey(s: string): number | null {
  const m = s.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  // Reject overflow such as Feb 30 (which Date silently rolls into March).
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Longest single session the manual editors accept (a full day). */
export const MAX_SESSION_MINUTES = 24 * 60;

export type PageError = 'order' | 'range';

/** Validate an optional from/to page pair against the book length. An inflated
 *  "to page" (3000 instead of 300) would otherwise poison pages read, pace,
 *  goals, heatmap and wrapped via pagesRead. */
export function pagesError(
  start: number | undefined,
  end: number | undefined,
  pageCount?: number
): PageError | null {
  if (start != null && end != null && end < start) return 'order';
  if (pageCount && pageCount > 0) {
    if ((start != null && start > pageCount) || (end != null && end > pageCount)) return 'range';
  }
  return null;
}

/** parseInt for a numeric text field: undefined when empty/garbled/negative. */
export function parsePageField(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Human readable duration from seconds, e.g. "1h 24m" or "12m" or "45s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/** Clock format HH:MM:SS or MM:SS for the live timer. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** Local time of day as HH:MM (24h) for a timestamp. */
export function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Date display formatting lives in src/i18n (it must be language-aware).
