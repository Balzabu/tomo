import React from 'react';
import type { WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { computeStats, buildHeatmap, computeGoalProgress } from '@/lib/stats';
import { monthsShort, weekdayInitials } from '@/i18n/strings';
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
import { getReadingSelection, removeReadingSelection, setReadingSelection } from './widget-prefs';
import { CurrentlyReadingWidget } from './CurrentlyReadingWidget';
import {
  QUICKSTART_MAX_ROWS,
  quickStartCapacity,
  QuickStartItem,
  QuickStartWidget,
} from './QuickStartWidget';
import { StreakGoalData, StreakGoalWidget } from './StreakGoalWidget';
import { FUTURE, heatmapLayout, HeatmapWidget, TODAY_EMPTY } from './HeatmapWidget';

const WIDGET_NAMES = ['CurrentlyReading', 'QuickStart', 'StreakGoal', 'Heatmap'] as const;
type WidgetName = (typeof WIDGET_NAMES)[number];

/** Render a widget, as a light/dark pair when the theme follows the system. */
export async function renderWidgetFor(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number,
  size?: WidgetSize
): Promise<WidgetRepresentation> {
  if (!ctx.systemThemes) return renderForName(name, ctx, widgetId, size);
  const { light, dark } = ctx.systemThemes;
  return {
    light: await renderForName(name, { ...ctx, theme: light }, widgetId, size),
    dark: await renderForName(name, { ...ctx, theme: dark }, widgetId, size),
  };
}

export async function renderForName(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number,
  size?: WidgetSize
): Promise<React.JSX.Element> {
  const { data, theme, t, lang } = ctx;

  switch (name) {
    case 'CurrentlyReading': {
      const list = readingBooks(data);
      if (list.length === 0) return <CurrentlyReadingWidget theme={theme} t={t} size={size} />;

      // Honour the per-widget book selection; fall back to the most-read book.
      const selectedId = widgetId != null ? await getReadingSelection(widgetId) : undefined;
      const book = list.find((b) => b.id === selectedId) ?? list[0];
      const index = Math.max(0, list.findIndex((b) => b.id === book.id));

      const streak = computeStats(data.books, data.sessions).currentStreak;
      const coverImage = await coverToWidgetImage(book.coverUrl);
      return (
        <CurrentlyReadingWidget
          theme={theme}
          t={t}
          size={size}
          index={index}
          total={list.length}
          book={{
            id: book.id,
            title: book.title,
            author: book.authors.join(', ') || t('common.unknownAuthor'),
            pct: progressPct(book),
            currentPage: book.currentPage,
            pageCount: book.pageCount,
            totalSeconds: bookTotalSeconds(data, book.id),
            streak,
            coverImage,
          }}
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
      return <QuickStartWidget theme={theme} t={t} size={size} books={books} more={more} />;
    }

    case 'StreakGoal': {
      const streak = computeStats(data.books, data.sessions).currentStreak;
      const dailyGoal =
        data.goals.find((g) => g.type === 'minutes_per_day') ??
        data.goals.find((g) => g.type === 'pages_per_day');

      const sg: StreakGoalData = {
        streak,
        todayMinutes: Math.round(todaySeconds(data) / 60),
      };
      if (dailyGoal) {
        const prog = computeGoalProgress(dailyGoal, data.books, data.sessions);
        sg.goal = {
          current: prog.current,
          target: dailyGoal.target,
          unit: dailyGoal.type === 'minutes_per_day' ? t('unit.min') : t('unit.pages'),
        };
      }

      return <StreakGoalWidget theme={theme} t={t} size={size} data={sg} />;
    }

    case 'Heatmap': {
      const { weeks } = heatmapLayout(size);
      const { cells, cols } = buildHeatmap(data.sessions, weeks);
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

      return (
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

async function handle(props: WidgetTaskHandlerProps, name: WidgetName): Promise<void> {
  const widgetId = props.widgetInfo.widgetId;
  const size = sizeOf(props.widgetInfo);

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const ctx = await loadWidgetContext();
      props.renderWidget(await renderWidgetFor(name, ctx, widgetId, size));
      break;
    }
    case 'WIDGET_CLICK': {
      // The only custom click action is cycling the "Currently reading" book.
      if (props.clickAction === 'CYCLE_READING' && name === 'CurrentlyReading') {
        const ctx = await loadWidgetContext();
        const list = readingBooks(ctx.data);
        if (list.length > 1) {
          const currentId = await getReadingSelection(widgetId);
          const curIdx = Math.max(0, list.findIndex((b) => b.id === currentId));
          const next = list[(curIdx + 1) % list.length];
          await setReadingSelection(widgetId, next.id);
        }
        props.renderWidget(await renderWidgetFor(name, ctx, widgetId, size));
      }
      // Other clicks use the built-in OPEN_URI action (handled natively).
      break;
    }
    case 'WIDGET_DELETED': {
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
