import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LOCK_TIMEOUTS, useLock } from '@/store/useLock';
import { useSnackbar } from '@/store/useSnackbar';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { SettingsBlockRow, SettingsFootnote, SettingsGroup, SettingsRow, SettingsSwitchRow } from '@/components/SettingsRow';
import { PinPad } from '@/components/PinPad';
import { biometricAvailable, biometricUnlock } from '@/components/AppLockGate';

type Flow =
  | null
  | { kind: 'create'; step: 'new' | 'confirm'; first?: string; then: 'enable' | 'change' }
  | { kind: 'verify'; then: 'disable' | 'change' };

export default function SecuritySettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const config = useLock((s) => s.config);
  const [flow, setFlow] = useState<Flow>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [bioOk, setBioOk] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setBioOk);
  }, []);

  const close = () => {
    setFlow(null);
    setMessage(undefined);
  };

  const onEnabled = async () => {
    close();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    useSnackbar.getState().show(tr('lock.enabledMsg'));
    // Offer the fingerprint right away - confirming it once proves it works.
    if (bioOk && (await biometricUnlock(tr('lock.biometricEnable'), tr('common.cancel')))) {
      useLock.getState().update({ biometric: true });
    }
  };

  const saveFailed = () => {
    setMessage(tr('lock.saveFailed'));
    setErrorKey((k) => k + 1);
  };

  const onSubmit = async (pin: string) => {
    if (!flow) return;
    if (flow.kind === 'verify') {
      const r = await useLock.getState().checkPin(pin);
      if (r !== 'ok') {
        // Paused after too many wrong PINs: say so - even the right PIN isn't
        // checked until the pause ends.
        const wait = useLock.getState().blockedMs();
        setMessage(wait > 0 ? tr('lock.wait', { s: Math.ceil(wait / 1000) }) : tr('lock.wrong'));
        setErrorKey((k) => k + 1);
        return;
      }
      setMessage(undefined);
      if (flow.then === 'disable') {
        if (!(await useLock.getState().disable())) return saveFailed();
        close();
        useSnackbar.getState().show(tr('lock.disabledMsg'));
      } else {
        setFlow({ kind: 'create', step: 'new', then: 'change' });
      }
      return;
    }
    if (flow.step === 'new') {
      setMessage(undefined);
      setFlow({ ...flow, step: 'confirm', first: pin });
      return;
    }
    if (pin !== flow.first) {
      setMessage(tr('lock.mismatch'));
      setErrorKey((k) => k + 1);
      setFlow({ ...flow, step: 'new', first: undefined });
      return;
    }
    if (flow.then === 'enable') {
      if (!(await useLock.getState().enable(pin))) return saveFailed();
      void onEnabled();
    } else {
      if (!(await useLock.getState().changePin(pin))) return saveFailed();
      close();
      useSnackbar.getState().show(tr('lock.changedMsg'));
    }
  };

  const toggle = (on: boolean) => {
    if (on) setFlow({ kind: 'create', step: 'new', then: 'enable' });
    else setFlow({ kind: 'verify', then: 'disable' });
  };

  const setBiometric = async (on: boolean) => {
    if (!on) {
      useLock.getState().update({ biometric: false });
      return;
    }
    if (await biometricUnlock(tr('lock.biometricEnable'), tr('common.cancel'))) {
      useLock.getState().update({ biometric: true });
    }
  };

  const title =
    flow?.kind === 'verify'
      ? tr('lock.enterCurrent')
      : flow?.step === 'confirm'
      ? tr('lock.confirmPin')
      : tr('lock.choosePin');

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name={config.enabled ? 'lock-closed' : 'lock-open'} size={30} color={t.colors.primary} />
        </View>
        <Text style={[styles.heroText, { color: t.colors.textMuted }]}>{tr('lock.desc')}</Text>
      </View>

      <SettingsGroup>
        <SettingsSwitchRow first icon="lock-closed" label={tr('lock.enable')} value={config.enabled} onChange={toggle} />
        {config.enabled ? <SettingsRow icon="keypad" label={tr('lock.change')} onPress={() => setFlow({ kind: 'verify', then: 'change' })} /> : null}
      </SettingsGroup>

      {config.enabled ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <SettingsGroup title={tr('lock.unlockGroup')}>
              <SettingsSwitchRow
                first
                icon="finger-print"
                label={tr('lock.biometric')}
                value={config.biometric && bioOk}
                disabled={!bioOk}
                onChange={(v) => void setBiometric(v)}
              />
            </SettingsGroup>
            {!bioOk ? <SettingsFootnote>{tr('lock.biometricUnavailable')}</SettingsFootnote> : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SettingsGroup title={tr('lock.privacyGroup')}>
              <SettingsSwitchRow
                first
                icon="eye-off"
                label={tr('lock.hideRecents')}
                value={config.hideRecents}
                onChange={(v) => useLock.getState().update({ hideRecents: v })}
              />
              <SettingsSwitchRow
                icon="notifications-off"
                label={tr('lock.hidePrivate')}
                value={config.hidePrivate}
                onChange={(v) => useLock.getState().update({ hidePrivate: v })}
              />
            </SettingsGroup>
            <SettingsFootnote>{tr('lock.hidePrivateHint')}</SettingsFootnote>
          </View>

          <SettingsGroup title={tr('lock.afterGroup')}>
            <SettingsBlockRow first icon="timer-outline" label={tr('lock.after')}>
              <Segmented
                value={config.timeoutSec}
                onChange={(v) => useLock.getState().update({ timeoutSec: v })}
                options={LOCK_TIMEOUTS.map((s) => ({ value: s, label: s === 0 ? tr('lock.immediately') : tr('lock.minutes', { n: s / 60 }) }))}
              />
            </SettingsBlockRow>
          </SettingsGroup>
        </>
      ) : null}

      <Modal visible={flow !== null} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={[styles.flow, { backgroundColor: t.colors.bg }]}>
          <View style={[styles.heroIcon, { backgroundColor: t.colors.cardAlt }]}>
            <Ionicons name="lock-closed" size={30} color={t.colors.primary} />
          </View>
          <PinPad
            resetKey={flow ? `${flow.kind}-${'step' in flow ? flow.step : ''}` : 'none'}
            title={title}
            subtitle={flow?.kind === 'create' && flow.step === 'new' ? tr('lock.pinHint') : undefined}
            length={flow?.kind === 'verify' ? config.pinLength : flow?.kind === 'create' && flow.step === 'confirm' ? flow.first?.length : undefined}
            onSubmit={onSubmit}
            errorKey={errorKey}
            message={message}
          />
          <Button label={tr('common.cancel')} variant="ghost" onPress={close} style={{ alignSelf: 'center' }} />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  heroText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: spacing.lg },
  flow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
});
