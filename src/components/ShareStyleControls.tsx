import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import type { ShareAspect, ShareStyle } from '@/components/ShareCard';
import { SHARE_IMMERSIVE_BG, SHARE_PAPER_BG, SHARE_PAPER_TEXT } from '@/lib/shareTheme';

interface Props {
  styles: ShareStyle[]; // which styles are offered (book vs quote differ)
  style: ShareStyle;
  aspect: ShareAspect;
  primary: string;
  accent: string;
  onStyle: (s: ShareStyle) => void;
  onAspect: (a: ShareAspect) => void;
}

const SWATCH: Record<ShareStyle, (primary: string, accent: string) => { bg: string; gradient?: string }> = {
  minimal: (p) => ({ bg: p }),
  gradient: (p, a) => ({ bg: p, gradient: a }),
  immersive: () => ({ bg: SHARE_IMMERSIVE_BG }),
  paper: () => ({ bg: SHARE_PAPER_BG }),
};

export function ShareStyleControls({ styles, style, aspect, primary, accent, onStyle, onAspect }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = t.colors;

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {styles.map((st) => {
          const sel = st === style;
          const sw = SWATCH[st](primary, accent);
          return (
            <Pressable
              key={st}
              onPress={() => onStyle(st)}
              accessibilityLabel={tr(`share.style.${st}`)}
              style={[
                s.swatch,
                { borderColor: sel ? c.primary : 'transparent', borderWidth: sel ? 2 : 0 },
              ]}
            >
              <View style={[s.swatchFill, { backgroundColor: sw.bg }]}>
                {sw.gradient ? (
                  <View style={[s.swatchHalf, { backgroundColor: sw.gradient }]} />
                ) : null}
                {st === 'immersive' ? <Ionicons name="image" size={16} color="#fff" /> : null}
                {st === 'paper' ? <Text style={{ fontSize: 15, color: SHARE_PAPER_TEXT, fontFamily: 'serif' }}>“</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[s.segment, { backgroundColor: c.cardAlt }]}>
        {(['square', 'story'] as ShareAspect[]).map((a) => {
          const sel = a === aspect;
          return (
            <Pressable
              key={a}
              onPress={() => onAspect(a)}
              style={[s.segBtn, sel && { backgroundColor: c.card }]}
            >
              <Ionicons
                name={a === 'square' ? 'square-outline' : 'phone-portrait-outline'}
                size={15}
                color={sel ? c.primary : c.textMuted}
              />
              <Text style={{ color: sel ? c.text : c.textMuted, fontWeight: '700', fontSize: 13 }}>
                {tr(`share.${a}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  swatch: { borderRadius: 12, padding: 2 },
  swatchFill: {
    width: 40,
    height: 40,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchHalf: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%' },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, alignSelf: 'center' },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
