import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

// Android's native dialogs follow the system light/dark mode and paint their
// buttons in the platform accent, whatever theme the app is in. This is a
// drop-in for react-native's Alert.alert drawn with the app theme instead:
// same arguments, same Android behaviour (dismissable by back/outside tap
// only when `cancelable`), and a queue, so an alert raised from another
// alert's button shows once the first has closed.

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

let nextId = 1;

const useAlerts = create<{ queue: AlertRequest[] }>(() => ({ queue: [] }));

function close(id: number) {
  useAlerts.setState((s) => ({ queue: s.queue.filter((a) => a.id !== id) }));
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions): void {
    const request = { id: nextId++, title, message, buttons, options };
    useAlerts.setState((s) => ({ queue: [...s.queue, request] }));
  },
};

/** Renders the queued alerts; mounted once in the root layout. */
export function AlertHost() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const current = useAlerts((s) => s.queue[0]);
  if (!current) return null;

  const buttons = current.buttons?.length ? current.buttons : [{ text: tr('common.ok') }];
  const press = (b: AlertButton) => {
    close(current.id);
    b.onPress?.();
  };
  const dismiss = () => {
    if (!current.options?.cancelable) return;
    close(current.id);
    current.options.onDismiss?.();
  };
  const colorOf = (b: AlertButton) =>
    b.style === 'destructive' ? t.colors.danger : b.style === 'cancel' ? t.colors.textMuted : t.colors.primary;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: t.colors.card }]}
          accessibilityRole="alert"
          accessibilityLabel={current.message ? `${current.title}\n${current.message}` : current.title}
        >
          <Text style={[styles.title, { color: t.colors.text }]}>{current.title}</Text>
          {current.message ? (
            <Text style={[styles.message, { color: t.colors.textMuted }]}>{current.message}</Text>
          ) : null}
          {/* Two buttons sit side by side; more stack (as Material does) so
              long labels in any language never wrap raggedly. */}
          <View style={buttons.length > 2 ? styles.buttonsStacked : styles.buttons}>
            {buttons.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => press(b)}
                accessibilityRole="button"
                hitSlop={4}
                style={({ pressed }) => [styles.button, pressed && { backgroundColor: t.colors.cardAlt }]}
              >
                <Text style={[styles.buttonText, { color: colorOf(b) }]}>{b.text ?? tr('common.ok')}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Same scrim and card as components/Dialog.
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    paddingTop: spacing.lg + 4,
    paddingHorizontal: spacing.lg + 4,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  title: { fontSize: 18, fontWeight: '800' },
  message: { fontSize: 15, lineHeight: 21 },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    marginRight: -spacing.sm,
  },
  buttonsStacked: { alignItems: 'flex-end', marginTop: spacing.sm, marginRight: -spacing.sm },
  button: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
