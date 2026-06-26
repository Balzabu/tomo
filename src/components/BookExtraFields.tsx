import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MOOD_OPTIONS, ReadingPace } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Pill } from '@/components/ui';

const PACES: ReadingPace[] = ['slow', 'medium', 'fast'];

interface Props {
  series: string;
  seriesNumber: string;
  pace?: ReadingPace;
  moods: string[];
  onSeries: (v: string) => void;
  onSeriesNumber: (v: string) => void;
  onPace: (v?: ReadingPace) => void;
  onMoods: (v: string[]) => void;
}

export function BookExtraFields({
  series,
  seriesNumber,
  pace,
  moods,
  onSeries,
  onSeriesNumber,
  onPace,
  onMoods,
}: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = t.colors;

  const toggleMood = (m: string) =>
    onMoods(moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m]);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.textMuted }]}>{tr('manual.series')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TextInput
            value={series}
            onChangeText={onSeries}
            placeholder={tr('manual.seriesPlaceholder')}
            placeholderTextColor={c.textFaint}
            style={[styles.input, { flex: 1, backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          />
          <TextInput
            value={seriesNumber}
            onChangeText={onSeriesNumber}
            placeholder={tr('manual.seriesNumber')}
            placeholderTextColor={c.textFaint}
            keyboardType="numeric"
            style={[styles.input, { width: 90, backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.textMuted }]}>{tr('book.pace')}</Text>
        <View style={styles.row}>
          {PACES.map((p) => (
            <Pill
              key={p}
              label={tr(`pace.${p}`)}
              color={c.primary}
              active={pace === p}
              onPress={() => onPace(pace === p ? undefined : p)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.textMuted }]}>{tr('book.moods')}</Text>
        <View style={styles.row}>
          {MOOD_OPTIONS.map((m) => (
            <Pill
              key={m}
              label={tr(`mood.${m}`)}
              color={c.accent}
              active={moods.includes(m)}
              onPress={() => toggleMood(m)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
});
