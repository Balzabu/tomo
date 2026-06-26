import {
  FlexWidget,
  OverlapWidget,
  SvgWidget,
  TextWidget,
} from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { hx, link, WidgetT } from './widget-shared';

interface Props {
  theme: Theme;
  t: WidgetT;
  pct: number; // 0..100
  centerText: string;
  subText: string;
}

export function StreakGoalWidget({ theme, t, pct, centerText, subText }: Props) {
  const c = theme.colors;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const ring = 96;

  const svg =
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${c.cardAlt}" stroke-width="9"/>` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${c.primary}" stroke-width="9" ` +
    `stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" ` +
    `transform="rotate(-90 50 50)"/></svg>`;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link('goals') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: 16,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <OverlapWidget style={{ width: ring, height: ring }}>
        <SvgWidget svg={svg} style={{ width: ring, height: ring }} />
        <FlexWidget
          style={{ width: ring, height: ring, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text={centerText}
            style={{ color: hx(c.text), fontSize: 22, fontWeight: '700' }}
          />
        </FlexWidget>
      </OverlapWidget>

      <TextWidget
        text={subText}
        maxLines={1}
        style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600', marginTop: 6 }}
      />
    </FlexWidget>
  );
}
