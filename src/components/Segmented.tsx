import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { radius, useTheme } from '@/theme/theme';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

/** A segmented control: one choice out of a few, equal-width segments. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  const h = size === 'sm' ? 34 : 42;
  return (
    <View style={[styles.track, { backgroundColor: t.colors.cardAlt, height: h }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            disabled={o.disabled}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={[
              styles.seg,
              // Dark: a translucent primary tint (no elevation - its shadow
              // would show through). Light: a raised white segment.
              active && (t.dark ? { backgroundColor: tint(t.colors.primary, 0.22) } : [styles.active, { backgroundColor: t.colors.card, shadowColor: '#000' }]),
              o.disabled && { opacity: 0.35 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: o.disabled }}
            accessibilityLabel={o.label}
          >
            {o.icon ? <Ionicons name={o.icon} size={size === 'sm' ? 13 : 15} color={active ? t.colors.primary : t.colors.textMuted} /> : null}
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? (t.dark ? t.colors.primary : t.colors.text) : t.colors.textMuted, fontSize: size === 'sm' ? 12 : 13 }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.md - 3, paddingHorizontal: 4 },
  active: { shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  label: { fontWeight: '700' },
});
