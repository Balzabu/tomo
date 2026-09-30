import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { CurvePoint } from '@/lib/plan';
import { ReadingPlanSpec } from '@/types';
import { useTheme } from '@/theme/theme';
import { formatDateKey, useTranslation } from '@/i18n';
import { dateKeyToDate } from '@/lib/utils';

const H = 150;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 6;

/**
 * Pages reached over time for one read, with the reading plan (if any) as a
 * dashed "where you should be" line. Also used, colour-overridden, inside the
 * memory share card.
 */
export function ReadingCurve({
  points,
  pageCount,
  plan,
  color,
  gridColor,
  width: fixedWidth,
  height = H,
  showLabels = true,
  labelColor,
}: {
  points: CurvePoint[];
  pageCount?: number;
  plan?: ReadingPlanSpec;
  color?: string;
  gridColor?: string;
  width?: number;
  height?: number;
  showLabels?: boolean;
  labelColor?: string;
}) {
  const t = useTheme();
  const { lang } = useTranslation();
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const stroke = color ?? t.colors.primary;
  const grid = gridColor ?? t.colors.border;
  const faint = labelColor ?? t.colors.textFaint;

  const first = points[0]?.date;
  let last = points[points.length - 1]?.date;
  if (plan && plan.target > last) last = plan.target;
  const startKey = plan && plan.start < first ? plan.start : first;
  const t0 = startKey ? dateKeyToDate(startKey).getTime() : 0;
  const t1 = last ? dateKeyToDate(last).getTime() : 1;
  const span = Math.max(1, t1 - t0);
  const maxPage = Math.max(1, pageCount ?? 0, ...points.map((p) => p.page));
  const x = (key: string) => PAD_L + ((dateKeyToDate(key).getTime() - t0) / span) * (width - PAD_L - PAD_R);
  const y = (page: number) => PAD_T + (1 - page / maxPage) * (height - PAD_T - PAD_B);

  let line = '';
  let area = '';
  if (width > 0 && points.length) {
    line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.page).toFixed(1)}`).join(' ');
    area = `${line} L${x(points[points.length - 1].date).toFixed(1)},${y(0)} L${x(points[0].date).toFixed(1)},${y(0)} Z`;
  }

  return (
    <View onLayout={fixedWidth ? undefined : (e) => setMeasured(e.nativeEvent.layout.width)}>
      {showLabels && pageCount ? (
        <Text style={[styles.label, styles.max, { color: faint }]}>{pageCount} p.</Text>
      ) : null}
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={PAD_L} x2={width - PAD_R} y1={y(maxPage)} y2={y(maxPage)} stroke={grid} strokeWidth={1} strokeDasharray="2 4" />
          <Line x1={PAD_L} x2={width - PAD_R} y1={y(0)} y2={y(0)} stroke={grid} strokeWidth={1} />
          {plan && pageCount ? (
            <Line
              x1={x(plan.start)}
              y1={y(plan.startPage)}
              x2={x(plan.target)}
              y2={y(pageCount)}
              stroke={faint}
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          ) : null}
          <Path d={area} fill={stroke} fillOpacity={0.14} />
          <Path d={line} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.length <= 14
            ? points.map((p) => <Circle key={p.date} cx={x(p.date)} cy={y(p.page)} r={3} fill={stroke} />)
            : null}
          {/* the latest point, always marked */}
          {points.length ? (
            <Circle cx={x(points[points.length - 1].date)} cy={y(points[points.length - 1].page)} r={4.5} fill={stroke} />
          ) : null}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {showLabels && first ? (
        <View style={styles.labels}>
          <Text style={[styles.label, { color: faint }]}>{formatDateKey(startKey!, lang)}</Text>
          <Text style={[styles.label, { color: faint }]}>{formatDateKey(last!, lang)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 11 },
  max: { textAlign: 'right', marginBottom: 2 },
});
