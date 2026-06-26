import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { hx, link, withAlpha, WidgetT } from './widget-shared';

interface Props {
  theme: Theme;
  t: WidgetT;
  // levels[week][day] in 0..4, day 0 = Monday
  levels: number[][];
  // 7 single-letter weekday initials, Monday-first
  weekdayLabels: string[];
  // e.g. "feb – giu"
  monthRange?: string;
}

const ALPHAS = [0, 0.3, 0.5, 0.75, 1];
const CELL = 8;
const GAP_V = 1;
const GAP_H = 2;

export function HeatmapWidget({ theme, t, levels, weekdayLabels, monthRange }: Props) {
  const c = theme.colors;

  const cellColor = (level: number) =>
    level <= 0 ? hx(c.cardAlt) : withAlpha(c.primary, ALPHAS[Math.min(4, level)]);

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link('stats') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={t('stats.calendar')}
            maxLines={1}
            truncate="END"
            style={{ color: hx(c.text), fontSize: 13, fontWeight: '700' }}
          />
        </FlexWidget>
        {monthRange ? (
          <TextWidget
            text={monthRange}
            style={{ color: hx(c.textMuted), fontSize: 11, fontWeight: '600' }}
          />
        ) : null}
      </FlexWidget>

      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <FlexWidget style={{ flexDirection: 'column', marginRight: 4 }}>
          {weekdayLabels.map((d, di) => (
            <FlexWidget
              key={di}
              style={{
                height: CELL,
                marginBottom: GAP_V,
                justifyContent: 'center',
              }}
            >
              <TextWidget
                text={d}
                style={{ color: hx(c.textFaint), fontSize: 7, fontWeight: '600' }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>

        {levels.map((week, wi) => (
          <FlexWidget key={wi} style={{ flexDirection: 'column', marginRight: GAP_H }}>
            {week.map((level, di) => (
              <FlexWidget
                key={di}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  marginBottom: GAP_V,
                  backgroundColor: cellColor(level),
                }}
              />
            ))}
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
