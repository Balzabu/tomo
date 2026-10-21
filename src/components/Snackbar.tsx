import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useSnackbar } from '@/store/useSnackbar';
import { useLock } from '@/store/useLock';

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
  const locked = useLock((s) => s.locked);

  // Keyed on `key`, not just the text: two identical messages in a row (e.g.
  // deleting two books) must each get their full timeout / undo window.
  // Behind the lock screen the clock stops: an Undo must not run out unseen,
  // so it gets its full window again once unlocked.
  // A bar with an action (Undo) stays longer: four seconds is enough to read
  // "Book deleted" but not to notice it, reach the bottom of the screen and
  // decide, which is what the action is there for.
  useEffect(() => {
    if (!message || locked) return;
    const id = setTimeout(dismiss, actionLabel ? 7000 : 4000);
    return () => clearTimeout(id);
  }, [message, key, dismiss, locked, actionLabel]);

  if (!message) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: t.colors.text }]} accessibilityLiveRegion="polite">
        <Text style={[styles.msg, { color: t.colors.bg }]} numberOfLines={2} accessibilityRole="alert">
          {message}
        </Text>
        {actionLabel ? (
          <Pressable onPress={act} hitSlop={8} accessibilityRole="button">
            {/* The bar is inverted (text colour as background); the theme's
                primary is too close to that in almost every theme, so the
                action uses the message colour and stands out by weight. */}
            <Text style={[styles.action, { color: t.colors.bg }]}>{actionLabel}</Text>
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
