import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/store/useSettings';
import { radius, spacing, useTheme } from '@/theme/theme';
import { formatDateKey, useTranslation } from '@/i18n';
import { SettingsFootnote } from '@/components/SettingsRow';
import { DAY_START_HOURS, dayStartLabel, readingDayKey } from '@/lib/readingDay';
import { useTodayKey } from '@/lib/useTodayKey';
import { toDateKey } from '@/lib/utils';

export default function DayStartSettings() {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const dayStartHour = useSettings((s) => s.dayStartHour);
  const setDayStartHour = useSettings((s) => s.setDayStartHour);
  // Re-rendered on focus, on resume and at the rollover, so the preview below
  // never describes a moment that has passed.
  useTodayKey();
  const c = t.colors;

  const pick = (h: number) => {
    void Haptics.selectionAsync();
    setDayStartHour(h);
  };

  // What the choice means right now: past midnight but before the day start
  // hour, reading still counts for yesterday.
  const now = readingDayKey();
  const stillYesterday = now !== toDateKey();
  const preview = tr(stillYesterday ? 'settings.dayStartNowYesterday' : 'settings.dayStartNowToday', {
    date: formatDateKey(now, lang, false),
  });

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {DAY_START_HOURS.map((h, i) => {
          const active = dayStartHour === h;
          return (
            <Pressable
              key={h}
              onPress={() => pick(h)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                pressed && { backgroundColor: c.cardAlt },
              ]}
            >
              <Ionicons name={h === 0 ? 'moon-outline' : 'time-outline'} size={20} color={c.textMuted} />
              <Text style={[styles.name, { color: c.text }]}>{dayStartLabel(h, tr('settings.dayStartMidnight'))}</Text>
              {active ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
      <SettingsFootnote>{tr('settings.dayStartHint')}</SettingsFootnote>
      <SettingsFootnote tone="success">{preview}</SettingsFootnote>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 54,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
});
