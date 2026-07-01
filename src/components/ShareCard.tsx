import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Theme } from '@/theme/theme';
import {
  SHARE_IMMERSIVE_BG,
  SHARE_PAPER_BG,
  SHARE_PAPER_MUTED,
  SHARE_PAPER_TEXT,
} from '@/lib/shareTheme';

export type ShareStyle = 'minimal' | 'gradient' | 'immersive' | 'paper';
export type ShareAspect = 'square' | 'story';

export interface BookCardContent {
  kind: 'book';
  title: string;
  author: string;
  coverUrl?: string;
  rating?: number;
  subtitle: string; // status or progress line
}
export interface QuoteCardContent {
  kind: 'quote';
  quote: string;
  title?: string;
  author?: string;
  page?: number;
  pageAbbr: string;
}
export interface WrappedCardContent {
  kind: 'wrapped';
  heading: string; // e.g. "Your 2026 in books"
  tiles: { label: string; value: string }[];
  highlights: { label: string; value: string }[];
}
export type ShareContent = BookCardContent | QuoteCardContent | WrappedCardContent;

interface Props {
  theme: Theme;
  style: ShareStyle;
  aspect: ShareAspect;
  width: number;
  content: ShareContent;
}

const PAPER_BG = SHARE_PAPER_BG;
const PAPER_TEXT = SHARE_PAPER_TEXT;
const PAPER_MUTED = SHARE_PAPER_MUTED;

/** A capture-ready shareable card. The forwarded ref is what view-shot snapshots. */
export const ShareCard = forwardRef<View, Props>(function ShareCard(
  { theme, style, aspect, width, content },
  ref
) {
  const c = theme.colors;
  const height = aspect === 'story' ? Math.round((width * 16) / 9) : width;

  const isPaper = style === 'paper';
  const fg = isPaper ? PAPER_TEXT : '#ffffff';
  const muted = isPaper ? PAPER_MUTED : 'rgba(255,255,255,0.82)';
  const brandColor = isPaper ? PAPER_MUTED : 'rgba(255,255,255,0.8)';
  const pad = Math.round(width * 0.08);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width, height, backgroundColor: bgColor(style, c) }]}
    >
      {style === 'gradient' ? (
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.primary} />
              <Stop offset="1" stopColor={c.accent} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#g)" />
        </Svg>
      ) : null}

      {style === 'immersive' && content.kind === 'book' && content.coverUrl ? (
        <>
          <Image source={{ uri: content.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,14,0.55)' }]} />
        </>
      ) : null}

      <View style={[styles.inner, { padding: pad }]}>
        <View style={styles.body}>
          {content.kind === 'book' ? (
            <BookBody content={content} fg={fg} muted={muted} starColor={c.star} cardAlt={c.cardAlt} width={width} height={height} immersive={style === 'immersive'} />
          ) : content.kind === 'quote' ? (
            <QuoteBody content={content} fg={fg} muted={muted} isPaper={isPaper} width={width} />
          ) : (
            <WrappedBody content={content} fg={fg} muted={muted} isPaper={isPaper} chipBg={chipBg(style)} width={width} />
          )}
        </View>
        <Text style={[styles.brand, { color: brandColor, fontFamily: isPaper ? 'serif' : undefined, marginTop: Math.round(width * 0.03) }]}>
          {isPaper ? 'Tomo' : 'TOMO'}
        </Text>
      </View>
    </View>
  );
});

function BookBody({
  content, fg, muted, starColor, cardAlt, width, height, immersive,
}: {
  content: BookCardContent; fg: string; muted: string; starColor: string; cardAlt: string; width: number; height: number; immersive: boolean;
}) {
  // Cover sized off the card HEIGHT so the square format stays compact and the
  // content never overflows onto the brand line.
  const coverH = Math.round(height * 0.30);
  const coverW = Math.round(coverH / 1.5);
  const gap = Math.round(width * 0.028);
  const r = content.rating ? Math.round(content.rating) : 0;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap }}>
      {content.coverUrl ? (
        <Image source={{ uri: content.coverUrl }} style={{ width: coverW, height: coverH, borderRadius: 8, backgroundColor: cardAlt }} contentFit="cover" />
      ) : (
        <View style={{ width: coverW, height: coverH, borderRadius: 8, backgroundColor: cardAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: coverW * 0.4 }}>📖</Text>
        </View>
      )}
      <Text style={[styles.bookTitle, { color: fg, fontSize: Math.round(width * 0.062) }]} numberOfLines={2}>
        {content.title}
      </Text>
      <Text style={[styles.bookAuthor, { color: muted, fontSize: Math.round(width * 0.042) }]} numberOfLines={1}>
        {content.author}
      </Text>
      {r > 0 ? (
        <Text style={{ fontSize: Math.round(width * 0.055), letterSpacing: 2 }}>
          <Text style={{ color: starColor }}>{'★'.repeat(r)}</Text>
          <Text style={{ color: muted }}>{'★'.repeat(Math.max(0, 5 - r))}</Text>
        </Text>
      ) : null}
      <View style={[styles.chip, { backgroundColor: immersive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.18)' }]}>
        <Text style={{ color: fg, fontSize: Math.round(width * 0.038), fontWeight: '700' }}>{content.subtitle}</Text>
      </View>
    </View>
  );
}

function QuoteBody({
  content, fg, muted, isPaper, width,
}: {
  content: QuoteCardContent; fg: string; muted: string; isPaper: boolean; width: number;
}) {
  const serif = isPaper ? 'serif' : undefined;
  const attribution = [content.title, content.author].filter(Boolean).join(' — ');
  return (
    <View style={{ gap: Math.round(width * 0.04) }}>
      <Text style={{ color: muted, fontSize: Math.round(width * 0.16), fontFamily: serif, marginBottom: -width * 0.07 }}>“</Text>
      <Text style={[styles.quote, { color: fg, fontSize: Math.round(width * 0.07), fontFamily: serif, fontStyle: isPaper ? 'italic' : 'normal' }]} numberOfLines={9}>
        {content.quote}
      </Text>
      {attribution ? (
        <Text style={{ color: muted, fontSize: Math.round(width * 0.044), fontFamily: serif }} numberOfLines={2}>
          — {attribution}
          {content.page != null ? ` · ${content.pageAbbr} ${content.page}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

function WrappedBody({
  content, fg, muted, isPaper, chipBg, width,
}: {
  content: WrappedCardContent; fg: string; muted: string; isPaper: boolean; chipBg: string; width: number;
}) {
  const serif = isPaper ? 'serif' : undefined;
  return (
    <View style={{ gap: Math.round(width * 0.035), width: '100%' }}>
      <Text style={{ color: fg, fontSize: Math.round(width * 0.085), fontWeight: '900', fontFamily: serif, lineHeight: Math.round(width * 0.095) }}>
        {content.heading}
      </Text>
      <View style={styles.tiles}>
        {content.tiles.map((tile) => (
          <View key={tile.label} style={[styles.tile, { backgroundColor: chipBg }]}>
            <Text style={{ color: fg, fontSize: Math.round(width * 0.07), fontWeight: '900', fontFamily: serif }} numberOfLines={1}>
              {tile.value}
            </Text>
            <Text style={{ color: muted, fontSize: Math.round(width * 0.034), fontWeight: '600' }} numberOfLines={1}>
              {tile.label}
            </Text>
          </View>
        ))}
      </View>
      {content.highlights.length ? (
        <View style={{ gap: 2, marginTop: 2 }}>
          {content.highlights.map((h) => (
            <View key={h.label} style={styles.hl}>
              <Text style={{ color: muted, fontSize: Math.round(width * 0.036) }} numberOfLines={1}>{h.label}</Text>
              <Text style={{ color: fg, fontSize: Math.round(width * 0.038), fontWeight: '700', flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
                {h.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function bgColor(style: ShareStyle, c: Theme['colors']): string {
  if (style === 'paper') return PAPER_BG;
  if (style === 'immersive') return SHARE_IMMERSIVE_BG;
  return c.primary;
}
function chipBg(style: ShareStyle): string {
  return style === 'paper' ? 'rgba(58,47,35,0.08)' : 'rgba(255,255,255,0.15)';
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 20 },
  inner: { flex: 1 },
  body: { flex: 1, justifyContent: 'center' },
  bookTitle: { fontWeight: '900', textAlign: 'center' },
  bookAuthor: { fontWeight: '500', textAlign: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, marginTop: 2 },
  quote: { fontWeight: '800' },
  brand: { fontSize: 13, fontWeight: '800', letterSpacing: 2, textAlign: 'center', opacity: 0.9 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '47%', flexGrow: 1, borderRadius: 12, padding: 10, gap: 2 },
  hl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 3 },
});
