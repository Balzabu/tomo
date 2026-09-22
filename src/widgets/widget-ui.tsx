import { FlexWidget, IconWidget, ImageWidget, OverlapWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { hx, ICON, ICON_FONT, withAlpha } from './widget-shared';

// Small building blocks shared by the home-screen widgets, so all four speak
// the same visual language (icons, bars, covers, buttons).

export function Icon({ glyph, size, color }: { glyph: string; size: number; color: string }) {
  return <IconWidget icon={glyph} font={ICON_FONT} size={size} style={{ color: hx(color) }} />;
}

/** Horizontal progress bar; `pct` in 0..100. */
export function ProgressBar({
  theme,
  pct,
  height = 6,
}: {
  theme: Theme;
  pct: number;
  height?: number;
}) {
  const c = theme.colors;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        width: 'match_parent',
        height,
        borderRadius: height / 2,
        backgroundColor: withAlpha(c.primary, theme.dark ? 0.18 : 0.14),
      }}
    >
      {p > 0 ? (
        <FlexWidget
          style={{ flex: p, height, borderRadius: height / 2, backgroundColor: hx(c.primary) }}
        />
      ) : null}
      {p < 100 ? <FlexWidget style={{ flex: 100 - p, height }} /> : null}
    </FlexWidget>
  );
}

/** Book cover with a tinted placeholder drawn underneath, so a cover that
 *  fails to load (offline, dead URL) still leaves a tidy book-shaped tile
 *  instead of a hole. */
export function Cover({
  theme,
  image,
  width,
  height,
  radius = 8,
}: {
  theme: Theme;
  image?: ImageWidgetSource;
  width: number;
  height: number;
  radius?: number;
}) {
  const c = theme.colors;
  const w = Math.round(width);
  const h = Math.round(height);
  return (
    <OverlapWidget style={{ width: w, height: h }}>
      <FlexWidget
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          backgroundColor: withAlpha(c.primary, theme.dark ? 0.22 : 0.16),
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon glyph={ICON.book} size={Math.max(12, Math.round(w * 0.42))} color={c.primary} />
      </FlexWidget>
      {image ? <ImageWidget image={image} imageWidth={w} imageHeight={h} radius={radius} /> : null}
    </OverlapWidget>
  );
}

/** Round, filled primary action button (e.g. "start a reading session"). */
export function RoundButton({
  theme,
  glyph,
  size,
  uri,
}: {
  theme: Theme;
  glyph: string;
  size: number;
  uri: string;
}) {
  const c = theme.colors;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hx(c.primary),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Icon glyph={glyph} size={Math.round(size * 0.46)} color={onPrimary(theme)} />
    </FlexWidget>
  );
}

/** Legible foreground on top of the theme's primary colour. The dark schemes
 *  use pastel primaries (dark text reads better); light schemes saturated ones. */
export function onPrimary(theme: Theme): string {
  return theme.dark ? theme.colors.bg : '#ffffff';
}
