import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
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
  loading,
  disabled,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
  first?: boolean;
  /** shows a spinner instead of the chevron and ignores taps */
  loading?: boolean;
  disabled?: boolean;
  /** replaces the chevron (e.g. an expand arrow) */
  trailing?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();
  const tint = danger ? t.colors.danger : t.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        (disabled || loading) && { opacity: loading ? 1 : 0.5 },
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
      {loading ? (
        <ActivityIndicator size="small" color={t.colors.primary} />
      ) : (
        <Ionicons name={trailing ?? 'chevron-forward'} size={18} color={t.colors.textFaint} />
      )}
    </Pressable>
  );
}

/** Footnote under a settings group (explanations, status lines). */
export function SettingsFootnote({ children, tone }: { children: React.ReactNode; tone?: 'muted' | 'danger' | 'success' }) {
  const t = useTheme();
  const color = tone === 'danger' ? t.colors.danger : tone === 'success' ? t.colors.success : t.colors.textFaint;
  return <Text style={[styles.footnote, { color }]}>{children}</Text>;
}

/** A settings row with a switch; the whole row toggles. */
export function SettingsSwitchRow({
  icon,
  label,
  hint,
  value,
  onChange,
  disabled,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
        pressed && { backgroundColor: t.colors.cardAlt },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={[styles.iconWrap, { backgroundColor: t.colors.cardAlt, opacity: disabled ? 0.5 : 1 }]}>
        <Ionicons name={icon} size={17} color={t.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: disabled ? t.colors.textFaint : t.colors.text, flex: 0 }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: t.colors.textFaint }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: t.colors.primary, false: t.colors.border }}
        thumbColor="#ffffff"
      />
    </Pressable>
  );
}

/** A settings row whose control sits under the label (segmented choices…). */
export function SettingsBlockRow({
  icon,
  label,
  children,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.block, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
      <View style={styles.blockHead}>
        <View style={[styles.iconWrap, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name={icon} size={17} color={t.colors.primary} />
        </View>
        <Text style={[styles.label, { color: t.colors.text }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footnote: { fontSize: 12, lineHeight: 17, marginHorizontal: spacing.sm, marginTop: -2 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  block: { paddingHorizontal: spacing.md, paddingVertical: 12, gap: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
