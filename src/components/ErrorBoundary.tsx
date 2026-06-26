import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onColor, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render-time crashes so the app shows a friendly screen instead of a
 *  blank white screen. Place inside the theme/i18n providers. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Tomo crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <Fallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function Fallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <View style={[styles.wrap, { backgroundColor: t.colors.bg }]}>
      <Ionicons name="sad-outline" size={56} color={t.colors.textFaint} />
      <Text style={[styles.title, { color: t.colors.text }]}>{tr('error.title')}</Text>
      <Text style={[styles.msg, { color: t.colors.textMuted }]}>{tr('error.message')}</Text>
      <Text style={[styles.detail, { color: t.colors.textFaint }]} numberOfLines={3}>
        {error.message}
      </Text>
      <Pressable onPress={onReset} style={[styles.btn, { backgroundColor: t.colors.primary }]}>
        <Text style={{ color: onColor(t.colors.primary), fontWeight: '800', fontSize: 15 }}>
          {tr('error.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  msg: { fontSize: 15, textAlign: 'center' },
  detail: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  btn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: 12 },
});
