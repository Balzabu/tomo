import { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** fired when the dialog becomes visible (e.g. to seed form fields) */
  onShow?: () => void;
  children: React.ReactNode;
}

/** Centered modal dialog for forms. Tall content should manage its own ScrollView. */
export function Dialog({ visible, onClose, title, onShow, children }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = t.colors;

  useEffect(() => {
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
        {/* Strong scrim - independent of theme overlay so light themes dim too. */}
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.card, { backgroundColor: c.card }]}>
            {title ? (
              <View style={styles.head}>
                <Text style={[styles.title, { color: c.text }]}>{title}</Text>
                <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={tr('common.close')}>
                  <Ionicons name="close" size={22} color={c.textFaint} />
                </Pressable>
              </View>
            ) : null}
            {children}
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
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '86%',
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
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
});
