import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { onColor, Theme } from '@/theme/theme';
import { CurvePoint } from '@/lib/plan';
import { ReadingCurve } from '@/components/ReadingCurve';
import {
  SHARE_IMMERSIVE_BG,
  SHARE_PAPER_ACCENT,
  SHARE_PAPER_BG,
  SHARE_PAPER_MUTED,
  SHARE_PAPER_TEXT,
} from '@/lib/shareTheme';

export type ShareStyle = 'minimal' | 'gradient' | 'immersive' | 'paper';
export type ShareAspect = 'square' | 'story';

export interface BookCardContent {
  kind: 'book';
  /** small label on top (e.g. "Sto leggendo") */
  kicker: string;
  title: string;
  author: string;
  coverUrl?: string;
  rating?: number;
  /** progress line, when reading */
  progress?: { pct: number; label: string };
}
export interface QuoteCardContent {
  kind: 'quote';
  kicker: string;
  quote: string;
  title?: string;
  author?: string;
  page?: number;
  /** "p. 42" in the app language. */
  pageLabel?: string;
  coverUrl?: string;
}
export interface WrappedCardContent {
  kind: 'wrapped';
  /** e.g. "Il mio anno in lettura" */
  kicker: string;
  year: string;
  /** the headline number (books finished) */
  hero: { value: string; label: string };
  stats: { label: string; value: string }[];
  highlights: { label: string; value: string }[];
  /** covers of the year's books, most recent first */
  covers: string[];
}
/** A stats card (e.g. the to-read pile): heading, tiles, detail rows. */
export interface StatsCardContent {
  kind: 'stats';
  kicker: string;
  heading: string;
  tiles: { label: string; value: string }[];
  highlights: { label: string; value: string }[];
  covers?: string[];
}
export interface MemoryCardContent {
  kind: 'memory';
  kicker: string;
  title: string;
  author: string;
  coverUrl?: string;
  rating?: number;
  /** e.g. "3 mar – 28 apr 2026" */
  dates: string;
  tiles: { label: string; value: string }[];
  quote?: string;
  curve?: CurvePoint[];
  pageCount?: number;
}
export type ShareContent = BookCardContent | QuoteCardContent | WrappedCardContent | StatsCardContent | MemoryCardContent;

interface Props {
  theme: Theme;
  style: ShareStyle;
  aspect: ShareAspect;
  width: number;
  content: ShareContent;
}

/** Colours a card is drawn with - derived once per style/theme. */
interface Ink {
  fg: string;
  muted: string;
  faint: string;
  /** translucent fill for tiles and chips */
  chip: string;
  /** the soft decorative discs behind the flat looks */
  disc: string;
  accent: string;
  star: string;
  serif: string;
  paper: boolean;
}

const SERIF = 'serif';

/** `#rrggbb` + alpha → rgba(). */
function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function inkFor(style: ShareStyle, theme: Theme): Ink {
  const c = theme.colors;
  if (style === 'paper') {
    return {
      fg: SHARE_PAPER_TEXT,
      muted: SHARE_PAPER_MUTED,
      faint: rgba(SHARE_PAPER_TEXT, 0.35),
      chip: rgba(SHARE_PAPER_TEXT, 0.07),
      disc: 'transparent',
      accent: SHARE_PAPER_ACCENT,
      star: '#b8860b',
      serif: SERIF,
      paper: true,
    };
  }
  // Text picks its colour off the background: pastel primaries (dark themes)
  // need dark ink, saturated ones white.
  const bg = style === 'immersive' ? SHARE_IMMERSIVE_BG : c.primary;
  const fg = style === 'immersive' ? '#ffffff' : onColor(bg);
  const light = fg === '#ffffff';
  return {
    fg,
    muted: light ? 'rgba(255,255,255,0.78)' : rgba(fg, 0.72),
    faint: light ? 'rgba(255,255,255,0.4)' : rgba(fg, 0.35),
    chip: light ? 'rgba(255,255,255,0.14)' : rgba(fg, 0.09),
    disc: light ? 'rgba(255,255,255,0.07)' : rgba(fg, 0.05),
    accent: fg,
    star: light ? '#ffd166' : '#8a5a00',
    serif: SERIF,
    paper: false,
  };
}

/** A capture-ready shareable card. The forwarded ref is what view-shot snapshots. */
export const ShareCard = forwardRef<View, Props>(function ShareCard({ theme, style, aspect, width, content }, ref) {
  const c = theme.colors;
  const height = aspect === 'story' ? Math.round((width * 16) / 9) : width;
  const ink = inkFor(style, theme);
  const pad = Math.round(width * 0.075);
  const u = width / 100; // one "unit": sizes below are in % of the card width
  const coverBg = content.kind === 'book' || content.kind === 'memory' ? content.coverUrl : undefined;
  const kicker = content.kicker;

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height, backgroundColor: bgColor(style, c) }]}>
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

      {style === 'immersive' && coverBg ? (
        <>
          <Image source={{ uri: coverBg }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,18,0.58)' }]} />
        </>
      ) : null}

      {/* Depth: two soft discs on the flat looks, an inset rule on paper. */}
      {style === 'minimal' || style === 'gradient' ? (
        <>
          <View style={[styles.disc, { width: width * 0.9, height: width * 0.9, borderRadius: width, top: -width * 0.38, right: -width * 0.42, backgroundColor: ink.disc }]} />
          <View style={[styles.disc, { width: width * 0.6, height: width * 0.6, borderRadius: width, bottom: -width * 0.28, left: -width * 0.26, backgroundColor: ink.disc }]} />
        </>
      ) : null}
      {style === 'paper' ? (
        <View style={[styles.disc, { top: pad * 0.45, left: pad * 0.45, right: pad * 0.45, bottom: pad * 0.45, borderRadius: 12, borderWidth: 1, borderColor: rgba(SHARE_PAPER_TEXT, 0.18) }]} />
      ) : null}

      <View style={[styles.inner, { padding: pad }]}>
        <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.4), fontWeight: '800', letterSpacing: u * 0.35, fontFamily: ink.paper ? SERIF : undefined }} numberOfLines={1}>
          {kicker.toLocaleUpperCase()}
        </Text>
        <View style={styles.body}>
          {content.kind === 'book' ? (
            <BookBody content={content} ink={ink} u={u} story={aspect === 'story'} />
          ) : content.kind === 'quote' ? (
            <QuoteBody content={content} ink={ink} u={u} story={aspect === 'story'} />
          ) : content.kind === 'memory' ? (
            <MemoryBody content={content} ink={ink} u={u} story={aspect === 'story'} inner={width - pad * 2} />
          ) : content.kind === 'stats' ? (
            <StatsBody content={content} ink={ink} u={u} story={aspect === 'story'} />
          ) : (
            <WrappedBody content={content} ink={ink} u={u} story={aspect === 'story'} />
          )}
        </View>
        <View style={styles.brand}>
          <Ionicons name="book" size={Math.round(u * 3.6)} color={ink.muted} />
          <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.6), fontWeight: '800', fontFamily: ink.paper ? SERIF : undefined, letterSpacing: u * 0.2 }}>
            Tomo
          </Text>
        </View>
      </View>
    </View>
  );
});

/** Stars with halves, drawn with the icon font (no emoji rendering quirks). */
function Stars({ rating, size, ink }: { rating: number; size: number; ink: Ink }) {
  const r = Math.round(rating * 2) / 2;
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.12 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={r >= i ? 'star' : r >= i - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={r >= i - 0.5 ? ink.star : ink.faint}
        />
      ))}
    </View>
  );
}

function CoverImage({ uri, w, ink, radius = 6 }: { uri?: string; w: number; ink: Ink; radius?: number }) {
  const h = Math.round(w * 1.5);
  const frame = { width: Math.round(w), height: h, borderRadius: radius, backgroundColor: ink.chip };
  return uri ? (
    <View style={[frame, styles.coverShadow]}>
      <Image source={{ uri }} style={[frame, { backgroundColor: undefined }]} contentFit="cover" />
    </View>
  ) : (
    <View style={[frame, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="book" size={Math.round(w * 0.38)} color={ink.faint} />
    </View>
  );
}

function BookBody({ content, ink, u, story }: { content: BookCardContent; ink: Ink; u: number; story: boolean }) {
  const title = (
    <Text style={{ color: ink.fg, fontSize: Math.round(u * (story ? 7.4 : 6.6)), fontWeight: '800', fontFamily: ink.serif, textAlign: story ? 'center' : 'left', lineHeight: Math.round(u * (story ? 9 : 8)) }} numberOfLines={3}>
      {content.title}
    </Text>
  );
  const author = (
    <Text style={{ color: ink.muted, fontSize: Math.round(u * 4.3), textAlign: story ? 'center' : 'left' }} numberOfLines={2}>
      {content.author}
    </Text>
  );
  const stars = content.rating ? <Stars rating={content.rating} size={Math.round(u * 5)} ink={ink} /> : null;
  const progress = content.progress ? (
    <View style={{ gap: u * 1.4, width: story ? '80%' : '100%' }}>
      <View style={{ height: u * 1.6, borderRadius: u, backgroundColor: ink.chip, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(3, content.progress.pct)}%`, height: '100%', borderRadius: u, backgroundColor: ink.fg }} />
      </View>
      <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.6), fontWeight: '700', textAlign: story ? 'center' : 'left' }}>{content.progress.label}</Text>
    </View>
  ) : null;

  if (story) {
    return (
      <View style={{ alignItems: 'center', gap: u * 3.2 }}>
        <CoverImage uri={content.coverUrl} w={u * 50} ink={ink} radius={u * 2.4} />
        <View style={{ gap: u * 1.2, alignItems: 'center', marginTop: u * 2 }}>
          {title}
          {author}
        </View>
        {stars}
        {progress}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 5.5 }}>
      <CoverImage uri={content.coverUrl} w={u * 34} ink={ink} radius={u * 2} />
      <View style={{ flex: 1, gap: u * 2.2 }}>
        <View style={{ gap: u * 1 }}>
          {title}
          {author}
        </View>
        {stars}
        {progress}
      </View>
    </View>
  );
}

function QuoteBody({ content, ink, u, story }: { content: QuoteCardContent; ink: Ink; u: number; story: boolean }) {
  // Size steps down with length; the line cap plus auto-fit keep any quote
  // inside the card.
  const len = content.quote.length;
  const base = story ? 8.4 : 7;
  const fs = u * (len < 70 ? base : len < 140 ? base * 0.84 : len < 240 ? base * 0.7 : base * 0.6);
  const lines = story ? 14 : 7;
  const meta = [content.author, content.pageLabel].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: u * 4 }}>
      <Text style={{ color: ink.accent, opacity: ink.paper ? 0.8 : 0.55, fontSize: Math.round(u * 20), lineHeight: Math.round(u * 17), fontFamily: SERIF, marginBottom: -u * 5 }}>“</Text>
      <Text
        style={{ color: ink.fg, fontSize: Math.round(fs), lineHeight: Math.round(fs * 1.34), fontFamily: SERIF, fontStyle: 'italic' }}
        numberOfLines={lines}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {content.quote}
      </Text>
      {content.title || meta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 3.4, marginTop: u * 1 }}>
          {content.coverUrl ? (
            <CoverImage uri={content.coverUrl} w={u * 10} ink={ink} radius={u * 1} />
          ) : (
            <View style={{ width: u * 8, height: 2, backgroundColor: ink.accent, opacity: 0.6 }} />
          )}
          <View style={{ flex: 1, gap: u * 0.6 }}>
            {content.title ? (
              <Text style={{ color: ink.fg, fontSize: Math.round(u * 4.2), fontWeight: '800' }} numberOfLines={2}>
                {content.title}
              </Text>
            ) : null}
            {meta ? (
              <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.6) }} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A fan of the year's covers, overlapping like books on a table. */
function CoverFan({ covers, w, ink }: { covers: string[]; w: number; ink: Ink }) {
  if (!covers.length) return null;
  const shown = covers.slice(0, 6);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
      {shown.map((uri, i) => (
        <View key={uri + i} style={{ marginLeft: i ? -w * 0.28 : 0, zIndex: shown.length - i, transform: [{ rotate: `${(i - (shown.length - 1) / 2) * 3}deg` }] }}>
          <CoverImage uri={uri} w={w} ink={ink} radius={w * 0.07} />
        </View>
      ))}
    </View>
  );
}

function StatTile({ s, ink, u, big }: { s: { label: string; value: string }; ink: Ink; u: number; big: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: ink.chip, borderRadius: u * 3, paddingVertical: u * (big ? 3.4 : 2.6), paddingHorizontal: u * 3, gap: u * 0.6 }}>
      <Text style={{ color: ink.fg, fontSize: Math.round(u * (big ? 7.4 : 5.6)), fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {s.value}
      </Text>
      <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.2), lineHeight: Math.round(u * 4), fontWeight: '600' }} numberOfLines={2}>
        {s.label}
      </Text>
    </View>
  );
}

function DetailRows({ rows, ink, u }: { rows: { label: string; value: string }[]; ink: Ink; u: number }) {
  return (
    <View>
      {rows.map((h, i) => (
        <View key={h.label} style={[styles.hl, { paddingVertical: u * 1.8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: ink.faint }]}>
          <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.6) }} numberOfLines={1}>
            {h.label}
          </Text>
          <Text style={{ color: ink.fg, fontSize: Math.round(u * 3.9), fontWeight: '800', flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
            {h.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatsBody({ content, ink, u, story }: { content: StatsCardContent; ink: Ink; u: number; story: boolean }) {
  return (
    <View style={{ gap: u * (story ? 6 : 4) }}>
      <Text style={{ color: ink.fg, fontSize: Math.round(u * (story ? 9 : 7.4)), lineHeight: Math.round(u * (story ? 10.4 : 8.6)), fontWeight: '900', fontFamily: ink.paper ? SERIF : undefined }} numberOfLines={2}>
        {content.heading}
      </Text>
      {content.covers?.length ? <CoverFan covers={content.covers} w={u * (story ? 16 : 12)} ink={ink} /> : null}
      <View style={{ flexDirection: 'row', gap: u * 2.4 }}>
        {content.tiles.slice(0, 3).map((s) => (
          <StatTile key={s.label} s={s} ink={ink} u={u} big={story} />
        ))}
      </View>
      {content.highlights.length ? <DetailRows rows={story ? content.highlights : content.highlights.slice(0, 2)} ink={ink} u={u} /> : null}
    </View>
  );
}

function WrappedBody({ content, ink, u, story }: { content: WrappedCardContent; ink: Ink; u: number; story: boolean }) {
  const tile = (s: { label: string; value: string }, big: boolean) => <StatTile key={s.label} s={s} ink={ink} u={u} big={big} />;
  const heading = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <Text style={{ color: ink.fg, fontSize: Math.round(u * (story ? 20 : 17)), lineHeight: Math.round(u * (story ? 22 : 18.5)), fontWeight: '900', fontFamily: ink.paper ? SERIF : undefined, letterSpacing: -u * 0.4 }}>
        {content.year}
      </Text>
      <View style={{ alignItems: 'flex-end', marginBottom: u * 1 }}>
        <Text style={{ color: ink.fg, fontSize: Math.round(u * (story ? 11 : 9)), lineHeight: Math.round(u * (story ? 12 : 10)), fontWeight: '900' }}>
          {content.hero.value}
        </Text>
        <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.6), fontWeight: '700' }}>{content.hero.label}</Text>
      </View>
    </View>
  );

  if (!story) {
    // Square: year + headline, the covers, three numbers. No list - it's what
    // made the square card overflow.
    return (
      <View style={{ gap: u * 4.5 }}>
        {heading}
        <CoverFan covers={content.covers} w={u * 15} ink={ink} />
        <View style={{ flexDirection: 'row', gap: u * 2.4 }}>{content.stats.slice(0, 3).map((s) => tile(s, false))}</View>
      </View>
    );
  }
  return (
    <View style={{ gap: u * 4.6 }}>
      {heading}
      {/* six covers overlapping by 28% span ~4.6 cover widths: fits the card */}
      <CoverFan covers={content.covers} w={u * 16} ink={ink} />
      <View style={{ gap: u * 2.4 }}>
        <View style={{ flexDirection: 'row', gap: u * 2.4 }}>{content.stats.slice(0, 2).map((s) => tile(s, true))}</View>
        {content.stats.length > 2 ? (
          <View style={{ flexDirection: 'row', gap: u * 2.4 }}>{content.stats.slice(2, 4).map((s) => tile(s, true))}</View>
        ) : null}
      </View>
      {content.highlights.length ? <DetailRows rows={content.highlights} ink={ink} u={u} /> : null}
    </View>
  );
}

function MemoryBody({ content, ink, u, story, inner }: { content: MemoryCardContent; ink: Ink; u: number; story: boolean; inner: number }) {
  const showCurve = !!content.curve && content.curve.length >= 2;
  // Square: the curve or the quote, not both.
  const showQuote = !!content.quote && (story || !showCurve);
  return (
    <View style={{ gap: u * (story ? 5.5 : 3.6) }}>
      <View style={{ flexDirection: 'row', gap: u * 4.5, alignItems: 'center' }}>
        <CoverImage uri={content.coverUrl} w={u * (story ? 30 : 20)} ink={ink} radius={u * 1.6} />
        <View style={{ flex: 1, gap: u * 1 }}>
          <Text style={{ color: ink.fg, fontSize: Math.round(u * (story ? 7 : 6)), lineHeight: Math.round(u * (story ? 8.4 : 7.2)), fontWeight: '800', fontFamily: SERIF }} numberOfLines={3}>
            {content.title}
          </Text>
          <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.9) }} numberOfLines={1}>
            {content.author}
          </Text>
          {content.dates ? (
            <Text style={{ color: ink.muted, fontSize: Math.round(u * 3.3), fontWeight: '700' }} numberOfLines={1}>
              {content.dates}
            </Text>
          ) : null}
          {content.rating ? (
            <View style={{ marginTop: u * 1 }}>
              <Stars rating={content.rating} size={Math.round(u * 4.4)} ink={ink} />
            </View>
          ) : null}
        </View>
      </View>
      {content.tiles.length ? (
        <View style={{ flexDirection: 'row', gap: u * 2 }}>
          {content.tiles.slice(0, 4).map((tile) => (
            <View key={tile.label} style={{ flex: 1, backgroundColor: ink.chip, borderRadius: u * 2.6, paddingVertical: u * 2.4, paddingHorizontal: u * 1, alignItems: 'center' }}>
              <Text style={{ color: ink.fg, fontSize: Math.round(u * 5.2), fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {tile.value}
              </Text>
              <Text style={{ color: ink.muted, fontSize: Math.round(u * 2.9), fontWeight: '600' }} numberOfLines={1}>
                {tile.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {showCurve ? (
        <ReadingCurve
          points={content.curve!}
          pageCount={content.pageCount}
          color={ink.fg}
          gridColor={ink.faint}
          labelColor={ink.muted}
          width={inner}
          height={Math.round(u * (story ? 30 : 16))}
          showLabels={false}
        />
      ) : null}
      {showQuote ? (
        <View style={{ flexDirection: 'row', gap: u * 3 }}>
          <View style={{ width: 2, backgroundColor: ink.accent, opacity: 0.6, borderRadius: 1 }} />
          <Text style={{ flex: 1, color: ink.fg, fontSize: Math.round(u * 4.4), lineHeight: Math.round(u * 6.2), fontStyle: 'italic', fontFamily: SERIF }} numberOfLines={story ? 6 : 3}>
            {content.quote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function bgColor(style: ShareStyle, c: Theme['colors']): string {
  if (style === 'paper') return SHARE_PAPER_BG;
  if (style === 'immersive') return SHARE_IMMERSIVE_BG;
  return c.primary;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 20 },
  inner: { flex: 1 },
  body: { flex: 1, justifyContent: 'center' },
  disc: { position: 'absolute' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 6 },
  coverShadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  hl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
});
