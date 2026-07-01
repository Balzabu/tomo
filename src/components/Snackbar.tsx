import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useSnackbar } from '@/store/useSnackbar';

/** Global snackbar with an optional action (e.g. "Undo"). Mounted once in the
 *  root layout. */
export function Snackbar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const message = useSnackbar((s) => s.message);
  const key = useSnackbar((s) => s.key);
  const actionLabel = useSnackbar((s) => s.actionLabel);
  const act = useSnackbar((s) => s.act);
  const dismiss = useSnackbar((s) => s.dismiss);

  // Keyed on `key`, not just the text: two identical messages in a row (e.g.
  // deleting two books) must each get their full timeout / undo window.
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(dismiss, 4000);
    return () => clearTimeout(id);
  }, [message, key, dismiss]);

  if (!message) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: t.colors.text }]}>
        <Text style={[styles.msg, { color: t.colors.bg }]} numberOfLines={2}>
          {message}
        </Text>
        {actionLabel ? (
          <Pressable onPress={act} hitSlop={8}>
            <Text style={[styles.action, { color: t.colors.primary }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  msg: { flex: 1, fontSize: 14, fontWeight: '600' },
  action: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
});
