import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import { useSettings } from '@/store/useSettings';
import { spacing } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { SettingsFootnote, SettingsGroup, SettingsRow, SettingsSwitchRow } from '@/components/SettingsRow';
import { TimePickerDialog } from '@/components/TimePickerDialog';
import { syncReminders } from '@/lib/reminders';
import {
  requestNotificationPermission,
} from '@/lib/notifications';

export default function RemindersSettings() {
  const { t: tr } = useTranslation();
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const reminderMinute = useSettings((s) => s.reminderMinute);
  const setReminder = useSettings((s) => s.setReminder);
  const reminderSmart = useSettings((s) => s.reminderSmart);
  const setReminderSmart = useSettings((s) => s.setReminderSmart);

  const [timePicker, setTimePicker] = useState(false);

  const fmtTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // The permission prompt / scheduling is async: block the switch meanwhile so
  // a second flip can't race the first.
  // The guard is a ref (state would let two flips in one frame both through);
  // a change made meanwhile (e.g. a new time) is applied right after.
  const [pending, setPending] = useState(false);
  const busyRef = useRef(false);
  const queuedRef = useRef<[boolean, number, number] | null>(null);
  const applyReminder = async (enabled: boolean, h: number, m: number) => {
    if (busyRef.current) {
      queuedRef.current = [enabled, h, m];
      return;
    }
    busyRef.current = true;
    setPending(true);
    try {
      let next: [boolean, number, number] | null = [enabled, h, m];
      while (next) {
        queuedRef.current = null;
        await applyReminderInner(...next);
        next = queuedRef.current;
      }
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };
  const applyReminderInner = async (enabled: boolean, h: number, m: number) => {
    if (enabled) {
      const ok = await requestNotificationPermission(tr('notif.channelReminders'));
      if (!ok) {
        Alert.alert(tr('settings.reminders'), tr('settings.reminderPermDenied'));
        setReminder(false, h, m);
        return;
      }
      // Save first: the planner reads the settings.
      setReminder(true, h, m);
      const scheduled = await syncReminders();
      if (!scheduled) {
        Alert.alert(tr('settings.reminders'), tr('settings.reminderPermDenied'));
        setReminder(false, h, m);
        return;
      }
    } else {
      // Off first, so a sync already in flight sees it and cancels too.
      setReminder(false, h, m);
      await syncReminders();
      return;
    }
    setReminder(enabled, h, m);
  };


  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <SettingsGroup>
          <SettingsSwitchRow
            first
            icon="notifications"
            label={tr('settings.reminderEnable')}
            value={reminderEnabled}
            disabled={pending}
            onChange={(v) => void applyReminder(v, reminderHour, reminderMinute)}
          />
          {reminderEnabled ? (
            <SettingsRow icon="time" label={tr('settings.reminderTime')} value={fmtTime(reminderHour, reminderMinute)} onPress={() => setTimePicker(true)} />
          ) : null}
        </SettingsGroup>
        <SettingsFootnote>{tr('settings.reminderDesc')}</SettingsFootnote>
      </View>

      {reminderEnabled ? (
        <View style={{ gap: spacing.sm }}>
          <SettingsGroup>
            <SettingsSwitchRow
              first
              icon="checkmark-done"
              label={tr('settings.reminderSmart')}
              value={reminderSmart}
              onChange={(v) => {
                setReminderSmart(v);
                void syncReminders();
              }}
            />
          </SettingsGroup>
          <SettingsFootnote>{tr('settings.reminderSmartHint')}</SettingsFootnote>
        </View>
      ) : null}

      <TimePickerDialog
        visible={timePicker}
        title={tr('settings.reminderTime')}
        hour={reminderHour}
        minute={reminderMinute}
        onClose={() => setTimePicker(false)}
        onSave={(h, m) => {
          setTimePicker(false);
          void applyReminder(true, h, m);
        }}
      />
    </ScrollView>
  );
}
