import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
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
import { Cover, Icon, onPrimary } from './widget-ui';

export interface QuickStartItem {
  id: string;
  title: string;
  author: string;
  /** 0..100, undefined when the book has no page count. */
  pct?: number;
  coverImage?: ImageWidgetSource;
}

interface Props {
  theme: Theme;
  t: WidgetT;
  size?: WidgetSize;
  books: QuickStartItem[];
  /** Books that didn't fit, and where tapping "+N" should take the user. */
  more?: { count: number; uri: string };
}

/** Default 3x3 cell footprint on a typical phone launcher. */
const DEFAULT_SIZE: WidgetSize = { width: 270, height: 280 };
const HEADER_H = 30;
const ROW_GAP = 6;
const MIN_ROW_H = 48;
const MAX_ROW_H = 68;
export const QUICKSTART_MAX_ROWS = 6;

/** How many book rows fit in a widget of the given size. */
export function quickStartCapacity(size?: WidgetSize): number {
  const { height } = sizeOr(size, DEFAULT_SIZE);
  const avail = height - WIDGET_PAD * 2 - HEADER_H;
  const n = Math.floor((avail + ROW_GAP) / (MIN_ROW_H + ROW_GAP));
  return Math.max(1, Math.min(QUICKSTART_MAX_ROWS, n));
}

export function QuickStartWidget({ theme, t, size, books, more }: Props) {
  const c = theme.colors;
  const s = sizeOr(size, DEFAULT_SIZE);
  const cap = quickStartCapacity(s);
  const shown = books.slice(0, cap);
  // Books the handler passed but that don't fit count as hidden too.
  const hidden = (more?.count ?? 0) + Math.max(0, books.length - shown.length);
  const avail = s.height - WIDGET_PAD * 2 - HEADER_H;
  // Rows share the height evenly (clamped), so the widget never ends with a
  // big blank band under the last book.
  const rows = Math.max(1, shown.length);
  const rowH = Math.max(
    MIN_ROW_H,
    Math.min(MAX_ROW_H, Math.floor((avail - (rows - 1) * ROW_GAP) / rows))
  );
  const coverH = rowH - 12;
  const narrow = s.width < 200;

  return (
    <FlexWidget
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
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: link('') }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <Icon glyph={ICON.play} size={15} color={c.primary} />
          <TextWidget
            text={t('book.startReading')}
            maxLines={1}
            truncate="END"
            style={{ color: hx(c.text), fontSize: 15, fontWeight: '700', marginLeft: 6 }}
          />
        </FlexWidget>
        {hidden > 0 ? (
          // More books than rows: say so, and open the (filtered) library.
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: more?.uri ?? link('') }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: 28,
              paddingLeft: 10,
              paddingRight: 6,
              borderRadius: 14,
              backgroundColor: withAlpha(c.primary, theme.dark ? 0.18 : 0.12),
            }}
          >
            <TextWidget
              text={`+${hidden}`}
              style={{ color: hx(c.primary), fontSize: 13, fontWeight: '700' }}
            />
            <Icon glyph={ICON.chevron} size={14} color={c.primary} />
          </FlexWidget>
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: link('search') }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: withAlpha(c.primary, theme.dark ? 0.18 : 0.12),
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon glyph={ICON.add} size={17} color={c.primary} />
          </FlexWidget>
        )}
      </FlexWidget>

      {shown.length === 0 ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: link('search') }}
          style={{
            flex: 1,
            width: 'match_parent',
            marginTop: 6,
            borderRadius: 16,
            backgroundColor: hx(c.cardAlt),
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon glyph={ICON.book} size={26} color={c.primary} />
          <TextWidget
            text={t('add.title')}
            maxLines={1}
            style={{ color: hx(c.primary), fontSize: 14, fontWeight: '700', marginTop: 6 }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column' }}>
          {shown.map((b, i) => (
            <FlexWidget
              key={b.id}
              clickAction="OPEN_URI"
              clickActionData={{ uri: link(`timer/${b.id}`) }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                height: rowH,
                backgroundColor: hx(c.cardAlt),
                borderRadius: 14,
                paddingHorizontal: 6,
                marginTop: i === 0 ? 0 : ROW_GAP,
              }}
            >
              <Cover
                theme={theme}
                image={b.coverImage}
                width={coverH * (2 / 3)}
                height={coverH}
                radius={5}
              />
              <FlexWidget style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                <TextWidget
                  text={b.title}
                  maxLines={rowH >= 60 && !narrow ? 2 : 1}
                  truncate="END"
                  style={{ color: hx(c.text), fontSize: 13, fontWeight: '700' }}
                />
                {rowH >= 54 ? (
                  <TextWidget
                    text={b.pct != null && b.pct > 0 ? `${b.pct}% · ${b.author}` : b.author}
                    maxLines={1}
                    truncate="END"
                    style={{ color: hx(c.textMuted), fontSize: 11, marginTop: 1 }}
                  />
                ) : null}
              </FlexWidget>
              <FlexWidget
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: hx(c.primary),
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 2,
                }}
              >
                <Icon glyph={ICON.play} size={15} color={onPrimary(theme)} />
              </FlexWidget>
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
