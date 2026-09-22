import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import {
  hx,
  ICON,
  link,
  sizeOr,
  WIDGET_PAD,
  WIDGET_RADIUS,
  WidgetSize,
  WidgetT,
  withAlpha,
} from './widget-shared';
import { Icon } from './widget-ui';

/** Level of a day that hasn't happened yet (the grid is padded to Sunday). */
export const FUTURE = -1;
/** Level of today when nothing was read yet - drawn as an outlined cell. */
export const TODAY_EMPTY = -2;

interface Props {
  theme: Theme;
  t: WidgetT;
  size?: WidgetSize;
  // levels[week][day]: 0..4, FUTURE or TODAY_EMPTY; day 0 = Monday
  levels: number[][];
  /** Week/day of today within `levels`, to outline it. */
  today?: { week: number; day: number };
  // 7 single-letter weekday initials, Monday-first
  weekdayLabels: string[];
  // e.g. "feb – giu"
  monthRange?: string;
  /** Days with any reading inside the visible range. */
  activeDays: number;
}

/** Default 4x2 cell footprint on a typical phone launcher. */
const DEFAULT_SIZE: WidgetSize = { width: 360, height: 180 };
const HEADER_H = 20;
const HEADER_GAP = 8;
const LEGEND_H = 16;
const LEGEND_GAP = 8;
const GAP = 3;
const ALPHAS = [0, 0.28, 0.5, 0.75, 1];

export interface HeatmapLayout {
  weeks: number;
  cell: number;
  labelW: number;
  legend: boolean;
}

/** Fit the grid to the widget: the cell size comes from the height (7 rows),
 *  the number of weeks from the width, so the calendar always fills the card. */
export function heatmapLayout(size?: WidgetSize): HeatmapLayout {
  const { width, height } = sizeOr(size, DEFAULT_SIZE);
  const legend = height >= 150;
  const gridH = height - WIDGET_PAD * 2 - HEADER_H - HEADER_GAP - (legend ? LEGEND_H + LEGEND_GAP : 0);
  const cell = Math.max(6, Math.min(20, Math.floor((gridH - 6 * GAP) / 7)));
  const labelW = cell >= 9 ? Math.max(12, cell) : 0;
  const gridW = width - WIDGET_PAD * 2 - labelW;
  const weeks = Math.max(4, Math.min(53, Math.floor((gridW + GAP) / (cell + GAP))));
  return { weeks, cell, labelW, legend };
}

export function HeatmapWidget({
  theme,
  t,
  size,
  levels,
  today,
  weekdayLabels,
  monthRange,
  activeDays,
}: Props) {
  const c = theme.colors;
  const { cell, labelW, legend } = heatmapLayout(size);
  // About 2 cells wide: no room for title + months, or count + legend.
  const narrow = sizeOr(size, DEFAULT_SIZE).width < 250;
  const title = narrow && monthRange ? monthRange : t('stats.calendar');
  const radius = Math.max(2, Math.round(cell * 0.28));
  const empty = withAlpha(c.primary, theme.dark ? 0.1 : 0.08);

  const cellColor = (level: number) =>
    level === FUTURE
      ? undefined
      : level <= 0
        ? empty
        : withAlpha(c.primary, ALPHAS[Math.min(4, level)]);

  const swatch = (color: `#${string}`, key: number) => (
    <FlexWidget
      key={key}
      style={{ width: 10, height: 10, borderRadius: 3, marginLeft: 3, backgroundColor: color }}
    />
  );

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link('stats') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: WIDGET_RADIUS,
        padding: WIDGET_PAD,
        flexDirection: 'column',
      }}
    >
      <FlexWidget
        style={{ flexDirection: 'row', width: 'match_parent', height: HEADER_H, alignItems: 'center' }}
      >
        <Icon glyph={ICON.calendar} size={14} color={c.primary} />
        <FlexWidget style={{ flex: 1, marginLeft: 6 }}>
          <TextWidget
            text={title}
            maxLines={1}
            truncate="END"
            style={{ color: hx(c.text), fontSize: 14, fontWeight: '700' }}
          />
        </FlexWidget>
        {monthRange && !narrow ? (
          <TextWidget
            text={monthRange}
            maxLines={1}
            style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600', marginLeft: 8 }}
          />
        ) : null}
      </FlexWidget>

      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'row',
          width: 'match_parent',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: HEADER_GAP,
        }}
      >
        {labelW > 0 ? (
          <FlexWidget style={{ flexDirection: 'column', width: labelW }}>
            {weekdayLabels.map((d, di) => (
              <FlexWidget
                key={di}
                style={{ height: cell, marginTop: di === 0 ? 0 : GAP, justifyContent: 'center' }}
              >
                {/* Mon / Wed / Fri only, like most contribution calendars. */}
                <TextWidget
                  text={di % 2 === 0 && di < 6 ? d : ''}
                  style={{
                    color: hx(c.textFaint),
                    fontSize: Math.max(8, Math.min(11, Math.round(cell * 0.72))),
                    fontWeight: '600',
                  }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
        ) : null}

        {levels.map((week, wi) => (
          <FlexWidget
            key={wi}
            style={{ flexDirection: 'column', marginLeft: wi === 0 ? 0 : GAP }}
          >
            {week.map((level, di) => {
              const isToday = today?.week === wi && today?.day === di;
              const bg = cellColor(level === TODAY_EMPTY ? 0 : level);
              return (
                <FlexWidget
                  key={di}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: radius,
                    marginTop: di === 0 ? 0 : GAP,
                    ...(bg ? { backgroundColor: bg } : {}),
                    ...(isToday ? { borderWidth: 1.5, borderColor: hx(c.text) } : {}),
                  }}
                />
              );
            })}
          </FlexWidget>
        ))}
      </FlexWidget>

      {legend ? (
        <FlexWidget
          style={{
            flexDirection: 'row',
            width: 'match_parent',
            height: LEGEND_H,
            alignItems: 'center',
            marginTop: LEGEND_GAP,
          }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={t('widget.activeDays', { n: activeDays })}
              maxLines={1}
              style={{ color: hx(c.textMuted), fontSize: 11, fontWeight: '600' }}
            />
          </FlexWidget>
          {!narrow ? (
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextWidget
                text={t('stats.less')}
                style={{ color: hx(c.textFaint), fontSize: 10, marginRight: 2 }}
              />
              {[0, 1, 2, 3, 4].map((l) => swatch(cellColor(l) as `#${string}`, l))}
              <TextWidget
                text={t('stats.more')}
                style={{ color: hx(c.textFaint), fontSize: 10, marginLeft: 5 }}
              />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
