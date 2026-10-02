import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui';
import { onColor, spacing, useTheme } from '@/theme/theme';
import { formatDateKey, monthYear, useTranslation, weekdayInitials } from '@/i18n';

import { toDateKey } from '@/lib/utils';

interface Props {
  visible: boolean;
  title: string;
  /** selected local day (YYYY-MM-DD) */
  value?: string;
  /** inclusive bounds (YYYY-MM-DD) - days outside are greyed out */
  min?: string;
  max?: string;
  onPick: (key: string) => void;
  onClose: () => void;
  /** optional "clear" action (e.g. remove a deadline) */
  onClear?: () => void;
}

const keyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Month-grid calendar in a dialog: tap a day to pick it. Monday-first. */
export function DatePickerDialog({ visible, title, value, min, max, onPick, onClose, onClear }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const today = toDateKey();
  const anchor = value ?? (min && min > today ? min : today);
  const [gridW, setGridW] = useState(0);
  const cell = Math.floor(gridW / 7);
  const [cursor, setCursor] = useState(() => ({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 }));

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (number | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  const shift = (delta: number) => {
    void Haptics.selectionAsync();
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      onShow={() => setCursor({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 })}
    >
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('date.prevMonth')}>
          <Ionicons name="chevron-back" size={22} color={t.colors.text} />
        </Pressable>
        <Text style={[styles.month, { color: t.colors.text }]}>
          {monthYear(cursor.y, cursor.m, lang, true)}
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('date.nextMonth')}>
          <Ionicons name="chevron-forward" size={22} color={t.colors.text} />
        </Pressable>
      </View>
      <View style={styles.row} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
        {weekdayInitials[lang].map((w, i) => (
          <Text key={i} style={[styles.dow, { color: t.colors.textFaint }, cell ? { flex: 0, width: cell } : null]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={[styles.grid, { opacity: cell ? 1 : 0 }]}>
        {cells.map((d, i) => {
          if (d == null) return <View key={i} style={{ width: cell, height: cell }} />;
          const key = keyOf(cursor.y, cursor.m, d);
          const disabled = (min != null && key < min) || (max != null && key > max);
          const selected = key === value;
          const isToday = key === today;
          return (
            <Pressable
              key={i}
              style={[styles.cell, { width: cell, height: cell }]}
              disabled={disabled}
              onPress={() => {
                void Haptics.selectionAsync();
                onPick(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={formatDateKey(key, lang)}
            >
              <View
                style={[
                  styles.day,
                  { width: cell - 6, height: cell - 6, borderRadius: cell },
                  selected && { backgroundColor: t.colors.primary },
                  !selected && isToday && { borderColor: t.colors.primary, borderWidth: 1.5 },
                ]}
              >
                <Text
                  style={{
                    color: selected ? onColor(t.colors.primary) : disabled ? t.colors.textFaint : t.colors.text,
                    opacity: disabled ? 0.45 : 1,
                    fontWeight: selected || isToday ? '800' : '500',
                  }}
                >
                  {d}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {onClear ? <Button label={tr('common.clear')} variant="ghost" full onPress={onClear} /> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  month: { fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  day: { alignItems: 'center', justifyContent: 'center' },
});
