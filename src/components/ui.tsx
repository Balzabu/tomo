import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.border,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CollapsibleCard({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Compact value shown on the right while collapsed (e.g. current theme). */
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: open ? spacing.md : 0 }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onToggle();
        }}
        style={collapsibleStyles.head}
      >
        <Text style={[collapsibleStyles.title, { color: t.colors.text }]}>{title}</Text>
        {!open && summary ? <View style={collapsibleStyles.summary}>{summary}</View> : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={t.colors.textMuted}
        />
      </Pressable>
      {open ? children : null}
    </Card>
  );
}

const collapsibleStyles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
});

interface BtnProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  full?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  full,
}: BtnProps) {
  const t = useTheme();
  const bg =
    variant === 'primary'
      ? t.colors.primary
      : variant === 'danger'
      ? t.colors.danger
      : variant === 'secondary'
      ? t.colors.cardAlt
      : 'transparent';
  const fg =
    variant === 'primary'
      ? onColor(t.colors.primary)
      : variant === 'danger'
      ? onColor(t.colors.danger)
      : variant === 'ghost'
      ? t.colors.primary
      : t.colors.text;

  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) return;
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function ProgressBar({
  progress,
  height = 8,
  color,
}: {
  progress: number; // 0..1
  height?: number;
  color?: string;
}) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{
        height,
        backgroundColor: t.colors.cardAlt,
        borderRadius: radius.pill,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          backgroundColor: color ?? t.colors.primary,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}

export function Pill({
  label,
  color,
  active,
  onPress,
  icon,
  emoji,
}: {
  label: string;
  color?: string;
  active?: boolean;
  onPress?: () => void;
  icon?: string;
  emoji?: string;
}) {
  const t = useTheme();
  const c = color ?? t.colors.primary;
  const content = (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: active ? c : t.colors.cardAlt,
          borderColor: active ? c : t.colors.border,
        },
      ]}
    >
      {emoji ? (
        <Text style={{ fontSize: 13 }}>{emoji}</Text>
      ) : icon ? (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={13}
          color={active ? onColor(c) : t.colors.textMuted}
        />
      ) : null}
      <Text
        style={{
          color: active ? onColor(c) : t.colors.textMuted,
          fontWeight: '600',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: t.colors.text }]}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={46} color={t.colors.textFaint} />
      <Text style={[styles.emptyTitle, { color: t.colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySub, { color: t.colors.textMuted }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnLabel: { fontWeight: '700', fontSize: 15 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800' as TextStyle['fontWeight'] },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
