import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, scrimColor, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** context line under the title (e.g. the book a note belongs to) */
  subtitle?: string;
  /** fired when the dialog becomes visible (e.g. to seed form fields) */
  onShow?: () => void;
  children: React.ReactNode;
  /** actions kept visible under the (scrollable) content */
  footer?: React.ReactNode;
}

/**
 * Centered modal dialog for forms. The body scrolls when it doesn't fit and
 * the whole dialog moves above the keyboard (an Android Modal is a window of
 * its own, which the activity's adjustResize doesn't reach), so the footer
 * actions are never hidden behind it.
 */
export function Dialog({ visible, onClose, title, subtitle, onShow, children, footer }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = t.colors;
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
      setKeyboard(0);
    };
  }, [visible]);

  // Layout effect: the seeded fields are in place before the dialog paints
  // (a passive effect would flash the previous values for a frame).
  useLayoutEffect(() => {
    if (visible) onShow?.();
    // fire once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: scrimColor(t) }, keyboard ? { paddingBottom: keyboard + spacing.md, paddingTop: spacing.xl + 24 } : null]} onPress={onClose}>
          <Pressable style={[styles.card, { backgroundColor: c.card }, t.dark && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
            {title ? (
              <View style={styles.head}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, { color: c.text }]}>{title}</Text>
                  {subtitle ? (
                    <Text style={[styles.subtitle, { color: c.textMuted }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={tr('common.close')}>
                  <Ionicons name="close" size={22} color={c.textFaint} />
                </Pressable>
              </View>
            ) : null}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { gap: spacing.md },
  footer: { gap: spacing.sm },
});
