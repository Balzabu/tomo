import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { computeStats, buildHeatmap, computeGoalProgress } from '@/lib/stats';
import { monthsShort, weekdayInitials } from '@/i18n/strings';
import {
  bookTotalSeconds,
  coverToWidgetImage,
  loadWidgetContext,
  progressPct,
  readingBooks,
  todaySeconds,
  unfinishedBooks,
  WidgetContext,
} from './widget-shared';
import { getReadingSelection, setReadingSelection } from './widget-prefs';
import { CurrentlyReadingWidget } from './CurrentlyReadingWidget';
import { QuickStartWidget, QuickStartItem } from './QuickStartWidget';
import { StreakGoalWidget } from './StreakGoalWidget';
import { HeatmapWidget } from './HeatmapWidget';

const WIDGET_NAMES = ['CurrentlyReading', 'QuickStart', 'StreakGoal', 'Heatmap'] as const;
type WidgetName = (typeof WIDGET_NAMES)[number];

export async function renderForName(
  name: WidgetName,
  ctx: WidgetContext,
  widgetId?: number
): Promise<React.JSX.Element> {
  const { data, theme, t, lang } = ctx;

  switch (name) {
    case 'CurrentlyReading': {
      const list = readingBooks(data);
      if (list.length === 0) return <CurrentlyReadingWidget theme={theme} t={t} />;

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
      const picked = unfinishedBooks(data, 3);
      const books: QuickStartItem[] = await Promise.all(
        picked.map(async (b) => ({
          id: b.id,
          title: b.title,
          coverImage: await coverToWidgetImage(b.coverUrl),
        }))
      );
      return <QuickStartWidget theme={theme} t={t} books={books} />;
    }

    case 'StreakGoal': {
      const streak = computeStats(data.books, data.sessions).currentStreak;
      const dailyGoal =
        data.goals.find((g) => g.type === 'minutes_per_day') ??
        data.goals.find((g) => g.type === 'pages_per_day');

      let pct = 0;
      let centerText = `🔥${streak}`;
      let subText = `${Math.round(todaySeconds(data) / 60)} ${t('unit.min')}`;

      if (dailyGoal) {
        const prog = computeGoalProgress(dailyGoal, data.books, data.sessions);
        pct = dailyGoal.target > 0 ? Math.round(Math.min(100, (prog.current / dailyGoal.target) * 100)) : 0;
        const unit = dailyGoal.type === 'minutes_per_day' ? t('unit.min') : t('unit.pages');
        centerText = `${pct}%`;
        subText = `${prog.current}/${dailyGoal.target} ${unit} · 🔥${streak}`;
      }

      return <StreakGoalWidget theme={theme} t={t} pct={pct} centerText={centerText} subText={subText} />;
    }

    case 'Heatmap': {
      const weeks = 17;
      const { cells, cols } = buildHeatmap(data.sessions, weeks);
      const levels: number[][] = [];
      for (let w = 0; w < cols; w++) {
        levels.push(cells.slice(w * 7, w * 7 + 7).map((c) => c.level));
      }
      const weekdayLabels = weekdayInitials[lang] ?? weekdayInitials.en;
      const months = monthsShort[lang] ?? monthsShort.en;
      const monthOf = (key?: string) =>
        key ? months[Number(key.split('-')[1]) - 1] ?? '' : '';
      const first = monthOf(cells[0]?.date);
      const last = monthOf(cells[cells.length - 1]?.date);
      const monthRange = first && last ? (first === last ? first : `${first} – ${last}`) : '';

      return (
        <HeatmapWidget
          theme={theme}
          t={t}
          levels={levels}
          weekdayLabels={weekdayLabels}
          monthRange={monthRange}
        />
      );
    }
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName as WidgetName;
  if (!WIDGET_NAMES.includes(name)) return;
  const widgetId = props.widgetInfo.widgetId;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const ctx = await loadWidgetContext();
      props.renderWidget(await renderForName(name, ctx, widgetId));
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
        props.renderWidget(await renderForName(name, ctx, widgetId));
      }
      // Other clicks use the built-in OPEN_URI action (handled natively).
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
