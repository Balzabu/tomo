import React from 'react';
import { getWidgetInfo } from 'react-native-android-widget';
import type { WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { computeStats, buildHeatmap, dailyTotals } from '@/lib/stats';
import { goalProgress, normalizeGoals } from '@/lib/goals';
import { monthsShort, weekdayInitials } from '@/i18n/strings';
import { labelValue, numUnitSep } from '@/i18n';
import { migrateLegacyKeys } from '@/lib/migrate';
import { emptyData } from '@/lib/storage';
import { toDateKey } from '@/lib/utils';
import {
  bookTotalSeconds,
  coverToWidgetImage,
  link,
  loadWidgetContext,
  progressPct,
  readingBooks,
  todaySeconds,
  unfinishedBooks,
  WidgetContext,
  WidgetSize,
} from './widget-shared';
import {
  bumpQuoteOffset,
  getQuoteOffset,
  cycleReadingSelection,
  getReadingSelection,
  removeQuoteOffset,
  removeReadingSelection,
} from './widget-prefs';
import { QuoteWidget } from './QuoteWidget';
import { PrivateWidget } from './widget-ui';
import { quoteOfDay } from '@/lib/quoteOfDay';
import { planProgress } from '@/lib/plan';
import type { AppData, Book, ReadingSession } from '@/types';
import type { Theme } from '@/theme/theme';

/** Today's reading-plan quota for the "Currently reading" widget. */
function planLine(book: Book, sessions: ReadingSession[], t: (k: string, p?: Record<string, string | number>) => string) {
  const p = planProgress(book, sessions);
  if (!p || p.status === 'done' || p.status === 'overdue') return undefined;
  const left = Math.max(0, p.todayTarget - p.todayRead);
  return left === 0 ? { text: t('widget.planDone'), done: true } : { text: t('widget.planLeft', { n: left }), done: false };
}
import { CurrentlyReadingWidget } from './CurrentlyReadingWidget';
import {
  QUICKSTART_MAX_ROWS,
  quickStartCapacity,
  QuickStartItem,
  QuickStartWidget,
} from './QuickStartWidget';
import { StreakGoalData, StreakGoalWidget } from './StreakGoalWidget';
import { FUTURE, heatmapLayout, HeatmapWidget, TODAY_EMPTY } from './HeatmapWidget';

const WIDGET_NAMES = ['CurrentlyReading', 'QuickStart', 'StreakGoal', 'Heatmap', 'Quote'] as const;
type WidgetName = (typeof WIDGET_NAMES)[number];

// The streak for the "Currently reading" and "Streak & goal" widgets: one
// refresh renders every placed widget from the same snapshot, so it is
// computed once per (books, sessions, day) rather than once per widget.
let streakMemo: { books: Book[]; sessions: ReadingSession[]; day: string; streak: number } | null = null;
function currentStreak(data: AppData): number {
  const day = toDateKey();
  const m = streakMemo;
  if (m && m.books === data.books && m.sessions === data.sessions && m.day === day) return m.streak;
  const streak = computeStats(data.books, data.sessions).currentStreak;
  streakMemo = { books: data.books, sessions: data.sessions, day, streak };
  return streak;
}

/** Render a widget, as a light/dark pair when the theme follows the system. */
export async function renderWidgetFor(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number,
  size?: WidgetSize
): Promise<WidgetRepresentation> {
  // The data work (and cover lookups) doesn't depend on the theme: do it once
  // and draw both variants from it.
  const draw = await prepareWidget(name, ctx, widgetId, size);
  if (!ctx.systemThemes) return draw(ctx.theme);
  const { light, dark } = ctx.systemThemes;
  return { light: draw(light), dark: draw(dark) };
}

export async function renderForName(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number,
  size?: WidgetSize
): Promise<React.JSX.Element> {
  return (await prepareWidget(name, ctx, widgetId, size))(ctx.theme);
}

/** Everything a widget shows, resolved; the returned function only lays it
 *  out in a given theme. */
async function prepareWidget(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number,
  size?: WidgetSize
): Promise<(theme: Theme) => React.JSX.Element> {
  const { data, t, lang } = ctx;

  // App lock on (and "hide contents" on): a neutral card instead of the
  // library, quotes or activity on the home screen.
  if (ctx.private) return (theme) => <PrivateWidget theme={theme} t={t} />;

  switch (name) {
    case 'CurrentlyReading': {
      const list = readingBooks(data);
      if (list.length === 0) return (theme) => <CurrentlyReadingWidget theme={theme} t={t} size={size} />;

      // Honour the per-widget book selection; fall back to the most-read book.
      const selectedId = widgetId != null ? await getReadingSelection(widgetId) : undefined;
      const book = list.find((b) => b.id === selectedId) ?? list[0];
      const index = Math.max(0, list.findIndex((b) => b.id === book.id));

      const streak = currentStreak(data);
      const coverImage = await coverToWidgetImage(book.coverUrl);
      const shown = {
        id: book.id,
        title: book.title,
        author: book.authors.join(', ') || t('common.unknownAuthor'),
        pct: progressPct(book),
        currentPage: book.currentPage,
        pageCount: book.pageCount,
        totalSeconds: bookTotalSeconds(data, book.id),
        streak,
        coverImage,
        plan: planLine(book, data.sessions, t),
      };
      return (theme) => (
        <CurrentlyReadingWidget
          theme={theme}
          t={t}
          size={size}
          index={index}
          total={list.length}
          book={shown}
        />
      );
    }

    case 'QuickStart': {
      // Only fetch the covers of the rows that actually fit.
      const all = unfinishedBooks(data, Infinity);
      const picked = all.slice(0, size ? quickStartCapacity(size) : QUICKSTART_MAX_ROWS);
      const rest = all.slice(picked.length);
      // "+N" opens the library filtered to "reading" when that's where the
      // hidden books are, otherwise the whole library.
      const more = rest.length
        ? {
            count: rest.length,
            uri: rest.every((b) => b.status === 'reading') ? link('?status=reading') : link(''),
          }
        : undefined;
      const books: QuickStartItem[] = await Promise.all(
        picked.map(async (b) => ({
          id: b.id,
          title: b.title,
          author: b.authors.join(', ') || t('common.unknownAuthor'),
          pct: b.pageCount ? progressPct(b) : undefined,
          coverImage: await coverToWidgetImage(b.coverUrl),
        }))
      );
      return (theme) => <QuickStartWidget theme={theme} t={t} size={size} books={books} more={more} />;
    }

    case 'StreakGoal': {
      const streak = currentStreak(data);
      const goals = normalizeGoals(data.goals);
      const dailyGoal =
        goals.find((g) => g.period === 'day' && g.metric === 'minutes') ??
        goals.find((g) => g.period === 'day' && g.metric === 'pages');

      const todayMinutes = Math.round(todaySeconds(data) / 60);
      const sep = numUnitSep(lang);
      const sg: StreakGoalData = {
        streak,
        todayMinutes,
        todayText: labelValue(lang, t('widget.today'), `${todayMinutes}${sep}${t('unit.min')}`),
      };
      if (dailyGoal) {
        const prog = goalProgress(dailyGoal, data.books, data.sessions);
        const unit = dailyGoal.metric === 'minutes' ? t('unit.min') : t('unit.pages', { n: dailyGoal.target });
        sg.goal = {
          current: prog.current,
          target: dailyGoal.target,
          unit,
          progressText: `${prog.current}/${dailyGoal.target}${sep}${unit}`,
        };
      }

      return (theme) => <StreakGoalWidget theme={theme} t={t} size={size} data={sg} />;
    }

    case 'Quote': {
      const offset = widgetId != null ? await getQuoteOffset(widgetId) : 0;
      const q = quoteOfDay(data.notes, toDateKey(), offset);
      const book = q ? data.books.find((b) => b.id === q.bookId) : undefined;
      const quoteCount = data.notes.filter((n) => n.type === 'quote' && n.text.trim()).length;
      const quote =
        q && book
          ? {
              text: q.text,
              bookId: book.id,
              title: book.title,
              author: book.authors[0],
              page: q.page,
              coverImage: await coverToWidgetImage(book.coverUrl),
              canShuffle: quoteCount > 1,
            }
          : undefined;
      return (theme) => <QuoteWidget theme={theme} t={t} size={size} quote={quote} />;
    }

    case 'Heatmap': {
      const { weeks } = heatmapLayout(size);
      const { cells, cols } = buildHeatmap(dailyTotals(data.sessions), weeks);
      // The grid is padded to the end of the current week: hide the days that
      // haven't happened yet and outline today.
      const todayKey = toDateKey();
      let today: { week: number; day: number } | undefined;
      const levels: number[][] = [];
      for (let w = 0; w < cols; w++) {
        levels.push(
          cells.slice(w * 7, w * 7 + 7).map((cell, d) => {
            if (cell.date > todayKey) return FUTURE;
            if (cell.date === todayKey) {
              today = { week: w, day: d };
              if (cell.level === 0) return TODAY_EMPTY;
            }
            return cell.level;
          })
        );
      }
      const activeDays = cells.filter((cell) => cell.date <= todayKey && cell.level > 0).length;
      const weekdayLabels = weekdayInitials[lang] ?? weekdayInitials.en;
      const months = monthsShort[lang] ?? monthsShort.en;
      const monthOf = (key?: string) =>
        key ? months[Number(key.split('-')[1]) - 1] ?? '' : '';
      const first = monthOf(cells[0]?.date);
      // Label with today's month, not the month of a padded future cell.
      const lastShown = cells.filter((cell) => cell.date <= todayKey).pop() ?? cells[cells.length - 1];
      const last = monthOf(lastShown?.date);
      const monthRange = first && last ? (first === last ? first : `${first} – ${last}`) : '';

      return (theme) => (
        <HeatmapWidget
          theme={theme}
          t={t}
          size={size}
          levels={levels}
          today={today}
          weekdayLabels={weekdayLabels}
          monthRange={monthRange}
          activeDays={activeDays}
        />
      );
    }
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName as WidgetName;
  if (!WIDGET_NAMES.includes(name)) return;
  try {
    await handle(props, name);
  } catch (e) {
    // An exception here leaves the widget stuck on its last frame (or blank
    // right after placement). Fall back to the empty-library rendering.
    console.warn('widget task failed', e);
    try {
      const ctx = await loadWidgetContext(emptyData);
      props.renderWidget(
        await renderWidgetFor(name, ctx, props.widgetInfo.widgetId, sizeOf(props.widgetInfo))
      );
    } catch {
      // nothing more we can do
    }
  }
}

/** The placed widget's size in dp (0x0 until the launcher reports one). */
export function sizeOf(info: { width: number; height: number }): WidgetSize {
  return { width: info.width, height: info.height };
}

/** The widget's size as the launcher reports it *now*, or `fallback`. An
 *  event carries the size from when it was queued, which can already be stale
 *  by the time the (possibly cold-started) JS gets to render it. */
export async function currentSize(
  name: string,
  widgetId: number,
  fallback: WidgetSize
): Promise<WidgetSize> {
  try {
    const info = (await getWidgetInfo(name)).find((i) => i.widgetId === widgetId);
    if (info && info.width > 0 && info.height > 0) return sizeOf(info);
  } catch {
    // fall through
  }
  return fallback;
}

// While a widget is being dropped, several launchers (OnePlus, Samsung, ...)
// fire WIDGET_ADDED and one or more WIDGET_RESIZED within a few hundred ms,
// the first ones with a provisional size. Rendering each of them makes the
// content visibly jump between layouts. Instead, every render event waits
// briefly and only the latest one per widget renders, at the size the
// launcher reports at that point. Headless tasks share one JS runtime, so a
// module-level map is enough.
const SETTLE_MS = 250;
let eventSeq = 0;
const latestEvent = new Map<number, number>();

/** Resolves to the size to render at, or null when a newer event for the
 *  same widget arrived meanwhile (that one renders instead). */
async function settle(name: string, widgetId: number, eventSize: WidgetSize): Promise<WidgetSize | null> {
  const seq = ++eventSeq;
  latestEvent.set(widgetId, seq);
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  if (latestEvent.get(widgetId) !== seq) return null;
  return currentSize(name, widgetId, eventSize);
}

async function handle(props: WidgetTaskHandlerProps, name: WidgetName): Promise<void> {
  const widgetId = props.widgetInfo.widgetId;
  const size = sizeOf(props.widgetInfo);

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      // Load the data while the launcher settles on a size.
      const [ctx, finalSize] = await Promise.all([
        loadWidgetContext(),
        settle(name, widgetId, size),
      ]);
      if (!finalSize) break; // superseded by a newer event for this widget
      props.renderWidget(await renderWidgetFor(name, ctx, widgetId, finalSize));
      break;
    }
    case 'WIDGET_CLICK': {
      // The only custom click action is cycling the "Currently reading" book.
      if (props.clickAction === 'CYCLE_READING' && name === 'CurrentlyReading') {
        const ctx = await loadWidgetContext();
        // Private mode (app lock on): no browsing the library from the home screen.
        if (!ctx.private) await cycleReadingSelection(widgetId, readingBooks(ctx.data).map((b) => b.id));
        props.renderWidget(await renderWidgetFor(name, ctx, widgetId, await currentSize(name, widgetId, size)));
      }
      if (props.clickAction === 'NEXT_QUOTE' && name === 'Quote') {
        // One load serves the private-mode check and the render (the offset
        // is read at render time, after the bump).
        const ctx = await loadWidgetContext();
        if (!ctx.private) {
          await bumpQuoteOffset(widgetId);
          props.renderWidget(await renderWidgetFor(name, ctx, widgetId, await currentSize(name, widgetId, size)));
        }
      }
      // Other clicks use the built-in OPEN_URI action (handled natively).
      break;
    }
    case 'WIDGET_DELETED': {
      if (name === 'Quote') await removeQuoteOffset(widgetId);
      if (name === 'CurrentlyReading') {
        // The only handler branch that skips loadWidgetContext (where the
        // legacy-key migration normally runs): migrate first, or a
        // pre-migration delete would no-op on the new key and the entry
        // would be resurrected when the old map is migrated later.
        await migrateLegacyKeys();
        await removeReadingSelection(widgetId);
      }
      break;
    }
    default:
      break;
  }
}
