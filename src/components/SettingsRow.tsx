import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useTheme } from '@/theme/theme';

/** A titled group of settings rows rendered as one card. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text style={[styles.groupHeader, { color: t.colors.textMuted }]}>{title.toUpperCase()}</Text>
      ) : null}
      <View
        style={[styles.card, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}
      >
        {children}
      </View>
    </View>
  );
}

/** A single tappable settings row: icon · label · value · chevron. */
export function SettingsRow({
  icon,
  label,
  value,
  valueNode,
  onPress,
  danger,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  const t = useTheme();
  const tint = danger ? t.colors.danger : t.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
        pressed && { backgroundColor: t.colors.cardAlt },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: t.colors.cardAlt }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.label, { color: danger ? t.colors.danger : t.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {valueNode ? (
        valueNode
      ) : value ? (
        <Text style={[styles.value, { color: t.colors.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginLeft: spacing.sm },
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
    paddingVertical: 12,
    minHeight: 56,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%' },
});
