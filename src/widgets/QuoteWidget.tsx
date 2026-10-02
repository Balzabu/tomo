import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { hx, ICON, link, sizeOr, WIDGET_PAD, WIDGET_RADIUS, WidgetSize, WidgetT, withAlpha } from './widget-shared';
import { Cover, Icon } from './widget-ui';

export interface QuoteData {
  text: string;
  bookId: string;
  title: string;
  author?: string;
  page?: number;
  coverImage?: ImageWidgetSource;
  /** more than one quote saved: show the "next" button */
  canShuffle: boolean;
}

interface Props {
  theme: Theme;
  t: WidgetT;
  size?: WidgetSize;
  quote?: QuoteData;
}

/** Default 4x2 cell footprint on a typical phone launcher. */
const DEFAULT_SIZE: WidgetSize = { width: 360, height: 180 };

/** The quote itself reads like a page: the system serif, as in the share card. */
const SERIF = 'serif';

/** ⇄ - another quote. */
function ShuffleButton({ theme, size }: { theme: Theme; size: number }) {
  const c = theme.colors;
  return (
    <FlexWidget
      clickAction="NEXT_QUOTE"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withAlpha(c.accent, theme.dark ? 0.2 : 0.14),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Icon glyph={ICON.shuffle} size={Math.round(size * 0.48)} color={c.accent} />
    </FlexWidget>
  );
}

/**
 * Quote of the day: one saved quote per day, tap for the book, ⇄ for another.
 * Laid out like the quote cards in the app - an accent rule beside the text,
 * the book (with its cover) underneath - and scaled to the widget's size.
 */
export function QuoteWidget({ theme, t, size, quote }: Props) {
  const c = theme.colors;
  const { width, height } = sizeOr(size, DEFAULT_SIZE);
  const root = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundColor: hx(c.card),
    borderRadius: WIDGET_RADIUS,
    padding: WIDGET_PAD,
  };

  if (!quote) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: link('notes') }}
        style={{ ...root, flexDirection: 'row', alignItems: 'center' }}
      >
        <FlexWidget
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: withAlpha(c.accent, theme.dark ? 0.2 : 0.14),
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon glyph={ICON.quote} size={22} color={c.accent} />
        </FlexWidget>
        <TextWidget
          text={t('widget.quoteEmpty')}
          maxLines={3}
          truncate="END"
          style={{ color: hx(c.textMuted), fontSize: 13, marginLeft: 12, width: Math.max(80, width - WIDGET_PAD * 2 - 56) }}
        />
      </FlexWidget>
    );
  }

  const open = { clickAction: 'OPEN_URI', clickActionData: { uri: link(`book/${quote.bookId}`) } } as const;
  const len = quote.text.length;
  const pageSuffix = quote.page != null ? ` · ${t('common.pageNum', { n: quote.page })}` : '';
  const rule = (h: 'match_parent' | number) => (
    <FlexWidget style={{ width: 3, height: h, borderRadius: 2, backgroundColor: hx(c.accent) }} />
  );

  // Short: the quote on a single band, ⇄ at the end (the full layout needs
  // room for a header, two lines and the book).
  if (height < 150) {
    const fontSize = len > 90 ? 13 : 15;
    const lines = Math.max(1, Math.floor((height - WIDGET_PAD * 2) / Math.round(fontSize * 1.3)));
    return (
      <FlexWidget style={{ ...root, flexDirection: 'row', alignItems: 'center' }}>
        {rule('match_parent')}
        <FlexWidget {...open} style={{ flex: 1, height: 'match_parent', justifyContent: 'center', marginLeft: 10 }}>
          <TextWidget
            text={quote.text}
            maxLines={lines}
            truncate="END"
            style={{ color: hx(c.text), fontSize, fontFamily: SERIF, fontStyle: 'italic' }}
          />
        </FlexWidget>
        {quote.canShuffle ? (
          <FlexWidget style={{ marginLeft: 8 }}>
            <ShuffleButton theme={theme} size={30} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
    );
  }

  // Header (label + ⇄), the quote, and the book underneath. The quote takes
  // what's left, its size stepping down for longer texts.
  const headerH = 26;
  const showCover = width >= 230 && height >= 150 && !!quote.coverImage;
  const footerH = showCover ? 40 : 34;
  const bodyH = height - WIDGET_PAD * 2 - headerH - footerH - 8;
  const base = height >= 260 ? 21 : 18;
  const fontSize = len > 260 ? base - 5 : len > 160 ? base - 3 : len > 90 ? base - 1 : base;
  const lineH = Math.round(fontSize * 1.38);
  const maxLines = Math.max(1, Math.floor(bodyH / lineH));
  const textW = width - WIDGET_PAD * 2 - 13;
  // The rule runs alongside the text, not the whole box: estimate the lines
  // the quote takes (serif italic averages about half an em per character).
  const estLines = Math.min(maxLines, Math.max(1, Math.ceil((len * fontSize * 0.5) / textW)));
  const ruleH = Math.min(bodyH, estLines * lineH);

  return (
    <FlexWidget style={{ ...root, flexDirection: 'column' }}>
      <FlexWidget style={{ width: 'match_parent', height: headerH, flexDirection: 'row', alignItems: 'center' }}>
        <Icon glyph={ICON.quote} size={14} color={c.accent} />
        <TextWidget
          text={t('widget.quoteOfDay')}
          maxLines={1}
          style={{ color: hx(c.textMuted), fontSize: 12, fontWeight: '700', marginLeft: 6 }}
        />
        <FlexWidget style={{ flex: 1 }} />
        {quote.canShuffle ? <ShuffleButton theme={theme} size={headerH + 2} /> : null}
      </FlexWidget>

      <FlexWidget
        {...open}
        style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
      >
        {rule(ruleH)}
        <TextWidget
          text={quote.text}
          maxLines={maxLines}
          truncate="END"
          style={{
            color: hx(c.text),
            fontSize,
            fontFamily: SERIF,
            fontStyle: 'italic',
            marginLeft: 10,
            width: textW,
          }}
        />
      </FlexWidget>

      <FlexWidget
        {...open}
        style={{ width: 'match_parent', height: footerH, flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
      >
        {showCover ? <Cover theme={theme} image={quote.coverImage} width={26} height={39} radius={4} /> : null}
        <FlexWidget style={{ flex: 1, marginLeft: showCover ? 10 : 0 }}>
          <TextWidget
            text={quote.title}
            maxLines={1}
            truncate="END"
            style={{ color: hx(c.text), fontSize: 13, fontWeight: '700' }}
          />
          {quote.author || pageSuffix ? (
            <TextWidget
              text={`${quote.author ?? ''}${quote.author ? pageSuffix : pageSuffix.replace(/^ · /, '')}`}
              maxLines={1}
              truncate="END"
              style={{ color: hx(c.textMuted), fontSize: 11, marginTop: 1 }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
