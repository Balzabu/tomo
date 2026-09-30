import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { PIN_MAX, PIN_MIN } from '@/lib/lockCore';

interface Props {
  title: string;
  subtitle?: string;
  /** fixed length (unlock): submits automatically when reached. Omit when
   *  choosing a new PIN - a confirm key appears from PIN_MIN digits. */
  length?: number;
  onSubmit: (pin: string) => void;
  /** bump to shake and clear (wrong PIN) */
  errorKey?: number;
  /** change to clear without shaking (next step of a flow) */
  resetKey?: string;
  /** replaces the subtitle in the error colour */
  message?: string;
  disabled?: boolean;
  /** shows a fingerprint key bottom-left */
  onBiometric?: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'] as const;

/** Numeric keypad with PIN dots - used by the lock screen and the setup flow. */
export function PinPad({ title, subtitle, length, onSubmit, errorKey, resetKey, message, disabled, onBiometric }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [pin, setPin] = useState('');
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => setPin(''), [resetKey]);
  const lastError = useRef(errorKey);
  useEffect(() => {
    if (errorKey === lastError.current) return;
    lastError.current = errorKey;
    setPin('');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence(
      [10, -10, 8, -8, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 50, useNativeDriver: true }))
    ).start();
  }, [errorKey, shake]);

  const press = (k: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (k === 'bio') {
      onBiometric?.();
      return;
    }
    void Haptics.selectionAsync();
    if (k === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const max = length ?? PIN_MAX;
    if (pin.length >= max) return;
    const next = pin + k;
    setPin(next);
    if (length && next.length === length) {
      // Let the last dot fill before the check (and possible shake).
      setTimeout(() => {
        onSubmit(next);
      }, 60);
    }
  };

  const dots = length ?? Math.max(PIN_MIN, pin.length);
  const canConfirm = !length && pin.length >= PIN_MIN;

  return (
    <View style={styles.wrap}>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Text style={[styles.title, { color: t.colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: message ? t.colors.danger : t.colors.textMuted }]}>
          {message ?? subtitle ?? ' '}
        </Text>
      </View>
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: dots }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: t.colors.primary, backgroundColor: i < pin.length ? t.colors.primary : 'transparent' },
            ]}
          />
        ))}
      </Animated.View>
      <View style={styles.pad}>
        {KEYS.map((k) => {
          if (k === 'bio' && canConfirm) {
            return (
              <Pressable
                key={k}
                onPress={() => onSubmit(pin)}
                style={[styles.key, { backgroundColor: t.colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={tr('common.ok')}
              >
                <Ionicons name="checkmark" size={30} color={onColor(t.colors.primary)} />
              </Pressable>
            );
          }
          if (k === 'bio' && !onBiometric) return <View key={k} style={styles.key} />;
          return (
            <Pressable
              key={k}
              onPress={() => press(k)}
              disabled={disabled || (k === 'del' && pin.length === 0)}
              style={({ pressed }) => [
                styles.key,
                k !== 'bio' && k !== 'del' && { backgroundColor: t.colors.cardAlt },
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? tr('lock.delete') : k === 'bio' ? tr('lock.useBiometric') : k}
            >
              {k === 'del' ? (
                <Ionicons name="backspace-outline" size={26} color={t.colors.text} />
              ) : k === 'bio' ? (
                <Ionicons name="finger-print" size={30} color={t.colors.primary} />
              ) : (
                <Text style={[styles.keyTxt, { color: t.colors.text }]}>{k}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY = 72;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xl },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', minHeight: 20, paddingHorizontal: spacing.xl },
  dots: { flexDirection: 'row', gap: spacing.lg, height: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { width: KEY * 3 + spacing.xl * 2, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, rowGap: spacing.lg },
  key: { width: KEY, height: KEY, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 28, fontWeight: '600' },
});
