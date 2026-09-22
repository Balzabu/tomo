import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
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

export interface StreakGoalData {
  streak: number;
  /** Minutes read today (shown when there is no daily goal). */
  todayMinutes: number;
  goal?: {
    current: number;
    target: number;
    /** Localised unit, e.g. "min" or "pagine". */
    unit: string;
  };
}

interface Props {
  theme: Theme;
  t: WidgetT;
  size?: WidgetSize;
  data: StreakGoalData;
}

/** Default 2x2 cell footprint on a typical phone launcher. */
const DEFAULT_SIZE: WidgetSize = { width: 170, height: 180 };
const FOOTER_H = 28;

function ringSvg(pct: number, track: string, fill: string, strokeRatio: number): string {
  const r = 50 - strokeRatio * 50;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const offset = circ * (1 - p / 100);
  const sw = (strokeRatio * 100).toFixed(1);
  return (
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="50" cy="50" r="${r.toFixed(1)}" fill="none" stroke="${track}" stroke-width="${sw}"/>` +
    (p > 0
      ? `<circle cx="50" cy="50" r="${r.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="${sw}" ` +
        `stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" ` +
        `transform="rotate(-90 50 50)"/>`
      : '') +
    `</svg>`
  );
}

/** Mix a #RRGGBB colour with another at `amount` (0..1) - SVG stroke colours
 *  can't carry the widget library's alpha conversion, so blend by hand. */
function mix(a: string, b: string, amount: number): string {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (v: number, shift: number) => (v >> shift) & 0xff;
  const out = [16, 8, 0]
    .map((sh) => Math.round(ch(pa, sh) * (1 - amount) + ch(pb, sh) * amount))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return `#${out}`;
}

export function StreakGoalWidget({ theme, t, size, data }: Props) {
  const c = theme.colors;
  const s = sizeOr(size, DEFAULT_SIZE);
  const { streak, goal } = data;

  const showFooter = s.height >= 120;
  const ring = Math.floor(
    Math.max(48, Math.min(s.width - WIDGET_PAD * 2, s.height - WIDGET_PAD * 2 - (showFooter ? FOOTER_H + 6 : 0)))
  );

  // Too small for a caption under the number (e.g. a 1x1 cell).
  const small = ring < 80;
  const pct = goal && goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
  const done = !!goal && goal.current >= goal.target && goal.target > 0;
  const fill = done ? c.success : c.primary;
  const track = mix(c.card, fill, theme.dark ? 0.22 : 0.16);

  const streakPill = (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: FOOTER_H,
        paddingHorizontal: 10,
        borderRadius: FOOTER_H / 2,
        backgroundColor: withAlpha(c.star, theme.dark ? 0.16 : 0.18),
        marginTop: 6,
      }}
    >
      <Icon glyph={ICON.flame} size={15} color={c.star} />
      <TextWidget
        text={t('widget.dayStreak', { n: streak })}
        maxLines={1}
        style={{ color: hx(c.text), fontSize: 12, fontWeight: '700', marginLeft: 4 }}
      />
    </FlexWidget>
  );

  // Big number + small caption stacked inside the ring.
  const center = goal ? (
    <FlexWidget style={{ width: ring, height: ring, justifyContent: 'center', alignItems: 'center' }}>
      {done ? (
        <Icon glyph={ICON.checkmark} size={Math.round(ring * (small ? 0.42 : 0.3))} color={c.success} />
      ) : (
        <TextWidget
          text={`${pct}%`}
          style={{ color: hx(c.text), fontSize: Math.round(ring * (small ? 0.27 : 0.22)), fontWeight: '800' }}
        />
      )}
      {!small ? (
        <TextWidget
          text={`${goal.current}/${goal.target} ${goal.unit}`}
          maxLines={1}
          style={{
            color: hx(c.textMuted),
            fontSize: Math.max(10, Math.round(ring * 0.085)),
            fontWeight: '600',
          }}
        />
      ) : null}
    </FlexWidget>
  ) : (
    <FlexWidget style={{ width: ring, height: ring, justifyContent: 'center', alignItems: 'center' }}>
      <Icon glyph={ICON.flame} size={Math.round(ring * 0.24)} color={c.star} />
      <TextWidget
        text={String(streak)}
        style={{ color: hx(c.text), fontSize: Math.round(ring * 0.24), fontWeight: '800' }}
      />
      {!small ? (
        <TextWidget
          text={t('widget.streakDays')}
          maxLines={1}
          style={{
            color: hx(c.textMuted),
            fontSize: Math.max(10, Math.round(ring * 0.085)),
            fontWeight: '600',
          }}
        />
      ) : null}
    </FlexWidget>
  );

  // Wide and short (e.g. 2x1): ring on the left, the numbers beside it,
  // instead of a small ring floating between two empty bands.
  if (s.width >= s.height * 1.6 && s.height < 140) {
    const r = Math.max(40, Math.floor(s.height - WIDGET_PAD * 2));
    const smallCenter = done ? (
      <Icon glyph={ICON.checkmark} size={Math.round(r * 0.42)} color={c.success} />
    ) : goal ? (
      <TextWidget
        text={`${pct}%`}
        style={{ color: hx(c.text), fontSize: Math.round(r * 0.26), fontWeight: '800' }}
      />
    ) : (
      <Icon glyph={ICON.flame} size={Math.round(r * 0.4)} color={c.star} />
    );
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: link('goals') }}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: hx(c.card),
          borderRadius: WIDGET_RADIUS,
          padding: WIDGET_PAD,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <OverlapWidget style={{ width: r, height: r }}>
          <SvgWidget
            svg={ringSvg(goal ? pct : 100, track, goal ? fill : track, 0.11)}
            style={{ width: r, height: r }}
          />
          <FlexWidget style={{ width: r, height: r, justifyContent: 'center', alignItems: 'center' }}>
            {smallCenter}
          </FlexWidget>
        </OverlapWidget>
        <FlexWidget style={{ flex: 1, marginLeft: 12 }}>
          <TextWidget
            text={goal ? `${goal.current}/${goal.target}` : String(streak)}
            maxLines={1}
            style={{ color: hx(c.text), fontSize: 20, fontWeight: '800' }}
          />
          <TextWidget
            text={goal ? goal.unit : t('widget.streakDays')}
            maxLines={1}
            style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600' }}
          />
          {goal ? (
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Icon glyph={ICON.flame} size={13} color={c.star} />
              <TextWidget
                text={String(streak)}
                style={{ color: hx(c.text), fontSize: 12, fontWeight: '700', marginLeft: 3 }}
              />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link('goals') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: WIDGET_RADIUS,
        padding: WIDGET_PAD,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <OverlapWidget style={{ width: ring, height: ring }}>
        <SvgWidget
          svg={ringSvg(goal ? pct : 100, track, goal ? fill : track, 0.1)}
          style={{ width: ring, height: ring }}
        />
        {center}
      </OverlapWidget>

      {showFooter ? (
        goal ? (
          streakPill
        ) : (
          <TextWidget
            text={`${t('widget.today')}: ${data.todayMinutes} ${t('unit.min')}`}
            maxLines={1}
            style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600', marginTop: 8 }}
          />
        )
      ) : null}
    </FlexWidget>
  );
}
