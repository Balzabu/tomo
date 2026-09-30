import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  dynamicTheme,
  radius,
  SCHEME_LIST,
  SCHEMES,
  SchemeChoice,
  spacing,
  useDynamicPalettes,
  useTheme,
} from '@/theme/theme';
import { useTranslation } from '@/i18n';

interface Props {
  choice: SchemeChoice;
  autoLabel: string;
  onPick: (choice: SchemeChoice) => void;
}

/** A grid of live theme previews - each card shows the scheme's real colours. */
export function ThemeGallery({ choice, autoLabel, onPick }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const palettes = useDynamicPalettes((s) => s.palettes);
  const dyn = palettes ? { light: dynamicTheme(palettes, false).colors, dark: dynamicTheme(palettes, true).colors } : null;

  return (
    <View style={styles.grid}>
      {/* Automatic (follows system light/dark) */}
      <Pressable
        onPress={() => onPick('system')}
        style={[
          styles.card,
          styles.autoCard,
          {
            borderColor: choice === 'system' ? t.colors.primary : t.colors.border,
            borderWidth: choice === 'system' ? 2 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ flex: 1, backgroundColor: SCHEMES.notte.colors.bg }} />
            <View style={{ flex: 1, backgroundColor: SCHEMES.giorno.colors.bg }} />
          </View>
        </View>
        <View style={styles.autoIcon}>
          <Ionicons name="contrast" size={22} color="#fff" />
        </View>
        <View style={styles.cardFooterAbs}>
          <Text style={[styles.name, { color: '#fff' }]} numberOfLines={1}>
            {autoLabel}
          </Text>
          {choice === 'system' ? (
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
          ) : null}
        </View>
      </Pressable>

      {/* Material You: wallpaper colours, light/dark following the system */}
      {dyn ? (
        <Pressable
          onPress={() => onPick('dynamic')}
          style={[
            styles.card,
            styles.autoCard,
            {
              borderColor: choice === 'dynamic' ? t.colors.primary : t.colors.border,
              borderWidth: choice === 'dynamic' ? 2 : StyleSheet.hairlineWidth,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: choice === 'dynamic' }}
        >
          <View style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <View style={{ flex: 1, backgroundColor: dyn.dark.bg, padding: spacing.md, gap: 5 }}>
                <View style={[styles.bar, { width: 24, backgroundColor: dyn.dark.primary }]} />
                <View style={[styles.dot, { backgroundColor: dyn.dark.accent }]} />
              </View>
              <View style={{ flex: 1, backgroundColor: dyn.light.bg, padding: spacing.md, gap: 5 }}>
                <View style={[styles.bar, { width: 24, backgroundColor: dyn.light.primary }]} />
                <View style={[styles.dot, { backgroundColor: dyn.light.accent }]} />
              </View>
            </View>
          </View>
          <View style={styles.autoIcon}>
            <Ionicons name="color-palette" size={22} color={dyn.dark.primary} />
          </View>
          <View style={styles.cardFooterAbs}>
            <Text style={[styles.name, { color: '#fff' }]} numberOfLines={1}>
              {tr('theme.dynamic')}
            </Text>
            {choice === 'dynamic' ? <Ionicons name="checkmark-circle" size={18} color="#fff" /> : null}
          </View>
        </Pressable>
      ) : null}

      {SCHEME_LIST.map((id) => {
        const c = SCHEMES[id].colors;
        const selected = choice === id;
        return (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            style={[
              styles.card,
              {
                backgroundColor: c.bg,
                borderColor: selected ? c.primary : c.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={styles.swatchRow}>
              <View style={[styles.bar, { width: 32, backgroundColor: c.primary }]} />
              <View style={[styles.dot, { backgroundColor: c.accent }]} />
              <View style={[styles.dot, { backgroundColor: c.star }]} />
            </View>
            <View style={[styles.line, { width: '78%', backgroundColor: c.text }]} />
            <View style={[styles.line, { width: '52%', backgroundColor: c.textMuted }]} />
            <View style={styles.cardFooter}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {tr(`theme.${id}`)}
              </Text>
              {selected ? (
                <Ionicons name="checkmark-circle" size={18} color={c.primary} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    height: 96,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bar: { height: 9, borderRadius: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  line: { height: 6, borderRadius: 3, marginTop: 7, opacity: 0.9 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  name: { fontSize: 13, fontWeight: '700', flex: 1 },
  autoCard: { justifyContent: 'flex-end' },
  autoIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooterAbs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginHorizontal: -spacing.md,
    marginBottom: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
