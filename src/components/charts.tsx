import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { HeatCell } from '@/lib/stats';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation, localizedWeekdayInitials } from '@/i18n';

const HEAT_GAP = 3;
const HEAT_LABEL_W = 18;

export function Heatmap({ cells, cols }: { cells: HeatCell[]; cols: number }) {
  const t = useTheme();
  const { lang } = useTranslation();
  // Measure the available width so the grid always fills the card edge-to-edge,
  // sizing each cell to fit instead of leaving empty space on the right.
  const [width, setWidth] = useState(0);
  const cell =
    width > 0 ? Math.max(8, (width - HEAT_LABEL_W - cols * HEAT_GAP) / cols) : 12;

  const levelColor = (level: number) => {
    if (level === 0) return t.colors.cardAlt;
    const alpha = [0, 0.3, 0.5, 0.75, 1][level];
    return withAlpha(t.colors.primary, alpha);
  };

  // arrange into columns of 7 (week) - cells are ordered day-by-day starting Monday
  const weeks: HeatCell[][] = [];
  for (let c = 0; c < cols; c++) {
    weeks.push(cells.slice(c * 7, c * 7 + 7));
  }
  const days = localizedWeekdayInitials(lang);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', gap: HEAT_GAP }}
    >
      <View style={{ gap: HEAT_GAP, width: HEAT_LABEL_W }}>
        {days.map((d, i) => (
          <Text
            key={i}
            style={{
              fontSize: Math.min(10, cell * 0.7),
              height: cell,
              lineHeight: cell,
              color: t.colors.textFaint,
            }}
          >
            {i === 0 || i === 2 || i === 4 ? d : ''}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ gap: HEAT_GAP, flex: 1 }}>
          {week.map((c, di) => (
            <View
              key={c?.date ?? `${wi}-${di}`}
              style={{
                width: '100%',
                aspectRatio: 1,
                borderRadius: Math.max(2, Math.round(cell * 0.22)),
                backgroundColor: c ? levelColor(c.level) : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function BarChart({
  data,
  height = 120,
  color,
}: {
  data: { label: string; value: number; sub?: string }[];
  height?: number;
  color?: string;
}) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.barRow, { height }]}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 18);
          return (
            <View key={i} style={styles.barCol}>
              <Text style={[styles.barValue, { color: t.colors.textMuted }]}>
                {d.value > 0 ? d.value : ''}
              </Text>
              <View
                style={{
                  width: '70%',
                  height: Math.max(d.value > 0 ? 4 : 0, h),
                  backgroundColor: color ?? t.colors.primary,
                  borderRadius: radius.sm,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.barRow}>
        {data.map((d, i) => (
          <View key={i} style={styles.barCol}>
            <Text style={[styles.barLabel, { color: t.colors.textFaint }]}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StatTile({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: t.colors.card, borderColor: t.colors.border },
      ]}
    >
      {icon}
      <Text style={[styles.tileValue, { color: t.colors.text }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: t.colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, marginBottom: 2 },
  barLabel: { fontSize: 10, marginTop: 4 },
  tile: {
    flex: 1,
    minWidth: '30%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: 2,
    alignItems: 'flex-start',
  },
  tileValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  tileLabel: { fontSize: 12 },
});
