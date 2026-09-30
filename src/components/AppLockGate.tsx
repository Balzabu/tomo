import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { applyRecentsSetting, graceTail, useLock } from '@/store/useLock';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { PinPad } from '@/components/PinPad';

/** Ask for the fingerprint/face; resolves whether it succeeded. */
export async function biometricUnlock(prompt: string, cancel: string): Promise<boolean> {
  // The system prompt can pause the activity: that's not leaving the app.
  useLock.getState().allowExternal(60_000);
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: cancel,
      // The PIN is our fallback, not the device credential.
      disableDeviceFallback: true,
      // Class 3 only: no camera face unlock that a photo could fool.
      biometricsSecurityLevel: 'strong',
    });
    return res.success;
  } catch {
    return false;
  } finally {
    graceTail();
  }
}

/** Biometrics usable right now (hardware present and something enrolled). */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/**
 * The lock screen. Shown on a cold start when the lock is on, and when the
 * app comes back after longer than the chosen timeout. It lives in its own
 * Modal so it also covers any dialog that was open when the app was left.
 */
export function AppLockGate() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const locked = useLock((s) => s.locked);
  const config = useLock((s) => s.config);
  const [errorKey, setErrorKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  // Mounted again while the app was away (Android recreated the activity but
  // the process lived on): start covered, the lock decision comes right away.
  const [covered, setCovered] = useState(() => {
    const s = useLock.getState();
    return s.config.enabled && s.leftAt > 0 && !s.leftInGrace;
  });
  const prompting = useRef(false);
  const [forgot, setForgot] = useState(false);

  // Leaving and coming back. Time away is measured on the monotonic clock
  // (useLock.markLeft/markBack): changing the device time can't skip a relock.
  useEffect(() => {
    // The 'active' event of that return may have fired before this listener
    // existed: decide now, or the app would stay unlocked (and every deferred
    // link held back forever).
    const s0 = useLock.getState();
    if (s0.leftAt > 0 && AppState.currentState === 'active') {
      applyRecentsSetting();
      s0.markBack();
      setCovered(false);
    }
    const sub = AppState.addEventListener('change', (st) => {
      const s = useLock.getState();
      if (st === 'background') {
        s.markLeft();
        // Cover the content right away, so coming back never shows a frame
        // of it before the lock decision (made on return: a sub-second pause
        // from tapping one of our own notifications must not lock).
        if (s.config.enabled && !useLock.getState().leftInGrace) setCovered(true);
        return;
      }
      if (st !== 'active') return;
      // The window/activity may have been recreated (wallpaper or language
      // change): re-apply the Recents setting every time we come back.
      applyRecentsSetting();
      s.markBack();
      setCovered(false);
    });
    return () => sub.remove();
  }, []);

  const tryBiometric = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await biometricUnlock(tr('lock.biometricPrompt'), tr('lock.usePin'));
    prompting.current = false;
    if (ok) useLock.getState().unlock();
  }, [tr]);

  // Offer the fingerprint as soon as the lock screen appears.
  useEffect(() => {
    if (locked && config.biometric) void tryBiometric();
  }, [locked, config.biometric, tryBiometric]);

  // Tick while PIN entry is paused so the countdown updates.
  void now; // re-render tick
  const waitMs = locked ? useLock.getState().blockedMs() : 0;
  useEffect(() => {
    if (!locked || !config.blockedFor) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked, config.blockedFor, config.blockedUntil]);

  if (!locked) {
    return covered ? (
      <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        <View style={[styles.screen, { backgroundColor: t.colors.bg }]}>
          <View style={[styles.logo, { backgroundColor: t.colors.cardAlt }]}>
            <Ionicons name="lock-closed" size={30} color={t.colors.primary} />
          </View>
        </View>
      </Modal>
    ) : null;
  }

  const onPin = async (pin: string) => {
    const r = await useLock.getState().tryPin(pin);
    setNow(Date.now());
    // (a 'wait' from a double submit isn't an error to shake at)
    if (r === 'wrong' || (r === 'wait' && useLock.getState().blockedMs() > 0)) setErrorKey((k) => k + 1);
  };

  const remaining = Math.max(0, 5 - config.failures);
  const message =
    waitMs > 0
      ? tr('lock.wait', { s: Math.ceil(waitMs / 1000) })
      : config.failures > 0
      ? remaining > 0 && remaining <= 3
        ? tr('lock.wrongLeft', { n: remaining })
        : tr('lock.wrong')
      : undefined;

  return (
    <Modal
      visible
      // No fade: the lock must cover the screen from the first frame back.
      animationType="none"
      statusBarTranslucent
      // Back leaves the app instead of dismissing the lock.
      onRequestClose={() => BackHandler.exitApp()}
    >
      <View style={[styles.screen, { backgroundColor: t.colors.bg }]}>
        <View style={[styles.logo, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name="lock-closed" size={30} color={t.colors.primary} />
        </View>
        <PinPad
          title={tr('lock.title')}
          subtitle={tr('lock.subtitle')}
          length={config.pinLength}
          onSubmit={onPin}
          errorKey={errorKey}
          message={message}
          disabled={waitMs > 0}
          onBiometric={config.biometric ? () => void tryBiometric() : undefined}
        />
        <Pressable
          onPress={() => setForgot((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={[styles.forgot, { color: t.colors.textMuted }]}>{tr('lock.forgot')}</Text>
        </Pressable>
        {/* Inline, not an alert: nothing else may show above the lock. */}
        {forgot ? (
          <Text style={[styles.forgotMsg, { color: t.colors.textMuted, backgroundColor: t.colors.cardAlt }]}>
            {tr('lock.forgotMsg')}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  logo: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  forgot: { fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  forgotMsg: { fontSize: 13, lineHeight: 19, padding: spacing.md, borderRadius: 12, maxWidth: 360 },
});
