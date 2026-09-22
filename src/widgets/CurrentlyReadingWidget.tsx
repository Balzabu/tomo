import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { formatDuration } from '@/lib/utils';
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
import { Cover, Icon, ProgressBar, RoundButton } from './widget-ui';

export interface CurrentlyReadingData {
  id: string;
  title: string;
  author: string;
  pct: number;
  currentPage: number;
  pageCount?: number;
  totalSeconds: number;
  streak: number;
  coverImage?: ImageWidgetSource;
}

interface Props {
  theme: Theme;
  t: WidgetT;
  size?: WidgetSize;
  book?: CurrentlyReadingData;
  /** 0-based position of `book` within the list of currently-reading books. */
  index?: number;
  /** Total number of currently-reading books. */
  total?: number;
}

/** Default 4x2 cell footprint on a typical phone launcher. */
const DEFAULT_SIZE: WidgetSize = { width: 360, height: 180 };

export function CurrentlyReadingWidget({ theme, t, size, book, index = 0, total = 0 }: Props) {
  const c = theme.colors;
  const { width, height } = sizeOr(size, DEFAULT_SIZE);

  const root = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundColor: hx(c.card),
    borderRadius: WIDGET_RADIUS,
  };

  if (!book) {
    const compact = height < 110;
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: link('search') }}
        style={{
          ...root,
          padding: WIDGET_PAD,
          flexDirection: compact ? 'row' : 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <FlexWidget
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: withAlpha(c.primary, theme.dark ? 0.2 : 0.14),
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon glyph={ICON.book} size={22} color={c.primary} />
        </FlexWidget>
        <FlexWidget
          style={{
            marginTop: compact ? 0 : 10,
            marginLeft: compact ? 12 : 0,
            alignItems: compact ? 'flex-start' : 'center',
          }}
        >
          <TextWidget
            text={t('book.startReading')}
            maxLines={1}
            style={{ color: hx(c.text), fontSize: 15, fontWeight: '700' }}
          />
          <TextWidget
            text={t('add.title')}
            maxLines={1}
            style={{ color: hx(c.primary), fontSize: 13, fontWeight: '600', marginTop: 2 }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  const pct = book.pct;
  const pageText = book.pageCount
    ? `${book.currentPage} / ${book.pageCount}`
    : `${t('common.pageAbbr')} ${book.currentPage}`;
  const timeText = formatDuration(book.totalSeconds, {
    h: t('unit.hourAbbr'),
    m: t('unit.minAbbr'),
    s: t('unit.secAbbr'),
  });
  const showSelector = total > 1;
  const openBook = link(`book/${book.id}`);
  const startTimer = link(`timer/${book.id}`);

  const selector = showSelector ? (
    <FlexWidget
      clickAction="CYCLE_READING"
      clickActionData={{}}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: withAlpha(c.primary, theme.dark ? 0.18 : 0.12),
        borderRadius: 14,
        paddingHorizontal: 9,
        paddingVertical: 5,
        marginLeft: 8,
      }}
    >
      <TextWidget
        text={`${index + 1}/${total}`}
        style={{ color: hx(c.primary), fontSize: 12, fontWeight: '700', marginRight: 5 }}
      />
      <Icon glyph={ICON.swap} size={13} color={c.primary} />
    </FlexWidget>
  ) : null;

  const stat = (glyph: string, text: string, color: string) => (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
      <Icon glyph={glyph} size={13} color={color} />
      <TextWidget
        text={text}
        maxLines={1}
        style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600', marginLeft: 4 }}
      />
    </FlexWidget>
  );

  // Narrow (about 2 cells wide, 2+ tall): stacked layout, cover next to the
  // big %. Narrow *and* short falls through to the single-row layout.
  if (width < 250 && height >= 130) {
    const coverH = Math.min(110, Math.max(48, height * 0.44));
    const tall = height >= 170;
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: openBook }}
        style={{ ...root, padding: WIDGET_PAD, flexDirection: 'column' }}
      >
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'flex-start' }}>
          <Cover theme={theme} image={book.coverImage} width={coverH * (2 / 3)} height={coverH} radius={6} />
          <FlexWidget style={{ flex: 1, marginLeft: 10, alignItems: 'flex-end' }}>
            {selector}
            <TextWidget
              text={`${pct}%`}
              style={{
                color: hx(c.text),
                fontSize: 26,
                fontWeight: '800',
                marginTop: showSelector ? 6 : 0,
              }}
            />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'flex-end' }}>
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
            <FlexWidget style={{ flex: 1, marginRight: 8 }}>
              <TextWidget
                text={book.title}
                maxLines={tall ? 2 : 1}
                truncate="END"
                style={{ color: hx(c.text), fontSize: 14, fontWeight: '700' }}
              />
              {tall ? (
                <TextWidget
                  text={book.author}
                  maxLines={1}
                  truncate="END"
                  style={{ color: hx(c.textMuted), fontSize: 12, marginTop: 1 }}
                />
              ) : null}
            </FlexWidget>
            <RoundButton theme={theme} glyph={ICON.play} size={36} uri={startTimer} />
          </FlexWidget>
          <FlexWidget style={{ width: 'match_parent', marginTop: 8 }}>
            <ProgressBar theme={theme} pct={pct} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    );
  }

  // Short (one cell tall): single row - cover, title + bar, play button.
  if (height < 130) {
    const coverH = Math.max(40, height - WIDGET_PAD * 2);
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: openBook }}
        style={{
          ...root,
          paddingHorizontal: WIDGET_PAD,
          paddingVertical: Math.min(WIDGET_PAD, 10),
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Cover theme={theme} image={book.coverImage} width={coverH * (2 / 3)} height={coverH} radius={6} />
        <FlexWidget style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={book.title}
                maxLines={1}
                truncate="END"
                style={{ color: hx(c.text), fontSize: 14, fontWeight: '700' }}
              />
            </FlexWidget>
            {selector}
          </FlexWidget>
          <FlexWidget style={{ width: 'match_parent', marginTop: 7 }}>
            <ProgressBar theme={theme} pct={pct} />
          </FlexWidget>
          <TextWidget
            text={`${pct}% · ${pageText}`}
            maxLines={1}
            style={{ color: hx(c.textMuted), fontSize: 11, fontWeight: '600', marginTop: 5 }}
          />
        </FlexWidget>
        <RoundButton theme={theme} glyph={ICON.play} size={40} uri={startTimer} />
      </FlexWidget>
    );
  }

  // Default (4x2 and larger): big cover filling the height, details on the
  // right, a one-tap "start session" button in the corner.
  const coverH = Math.min(height - WIDGET_PAD * 2, (width - WIDGET_PAD * 2) * 0.5);
  const big = height >= 190;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: openBook }}
      style={{ ...root, padding: WIDGET_PAD, flexDirection: 'row' }}
    >
      <Cover theme={theme} image={book.coverImage} width={coverH * (2 / 3)} height={coverH} radius={10} />

      <FlexWidget style={{ flex: 1, height: 'match_parent', marginLeft: 14 }}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'flex-start' }}>
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={book.title}
              maxLines={2}
              truncate="END"
              style={{ color: hx(c.text), fontSize: big ? 18 : 16, fontWeight: '700' }}
            />
            <TextWidget
              text={book.author}
              maxLines={1}
              truncate="END"
              style={{ color: hx(c.textMuted), fontSize: 13, marginTop: 2 }}
            />
          </FlexWidget>
          {selector}
        </FlexWidget>

        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'flex-end' }}>
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'flex-end' }}>
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={`${pct}%`}
                style={{ color: hx(c.text), fontSize: big ? 26 : 22, fontWeight: '800' }}
              />
              <TextWidget
                text={pageText}
                maxLines={1}
                style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '600' }}
              />
            </FlexWidget>
            <RoundButton theme={theme} glyph={ICON.play} size={big ? 46 : 40} uri={startTimer} />
          </FlexWidget>
          <FlexWidget style={{ width: 'match_parent', marginTop: 8 }}>
            <ProgressBar theme={theme} pct={pct} />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            {stat(ICON.time, timeText, c.textMuted)}
            {book.streak > 0 ? stat(ICON.flame, String(book.streak), c.star) : null}
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
