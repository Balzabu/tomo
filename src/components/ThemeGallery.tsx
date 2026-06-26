import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  radius,
  SCHEME_LIST,
  SCHEMES,
  SchemeChoice,
  spacing,
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
