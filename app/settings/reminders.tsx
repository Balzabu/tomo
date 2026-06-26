import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/store/useSettings';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, Card } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import {
  cancelReminders,
  requestNotificationPermission,
  scheduleDailyReminder,
} from '@/lib/notifications';

export default function RemindersSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const reminderMinute = useSettings((s) => s.reminderMinute);
  const setReminder = useSettings((s) => s.setReminder);

  const [timePicker, setTimePicker] = useState(false);
  const [tmpHour, setTmpHour] = useState(reminderHour);
  const [tmpMinute, setTmpMinute] = useState(reminderMinute);

  const fmtTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const applyReminder = async (enabled: boolean, h: number, m: number) => {
    if (enabled) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        Alert.alert(tr('settings.reminders'), tr('settings.reminderPermDenied'));
        setReminder(false, h, m);
        return;
      }
      await scheduleDailyReminder(h, m, tr('notif.title'), tr('notif.body'));
    } else {
      await cancelReminders();
    }
    setReminder(enabled, h, m);
  };

  const openTimePicker = () => {
    setTmpHour(reminderHour);
    setTmpMinute(reminderMinute);
    setTimePicker(true);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.reminderDesc')}</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: t.colors.text }]}>{tr('settings.reminderEnable')}</Text>
          <Switch
            value={reminderEnabled}
            onValueChange={(v) => void applyReminder(v, reminderHour, reminderMinute)}
            trackColor={{ true: t.colors.primary, false: t.colors.border }}
            thumbColor="#ffffff"
          />
        </View>
        {reminderEnabled ? (
          <Pressable style={styles.row} onPress={openTimePicker}>
            <Text style={[styles.label, { color: t.colors.text }]}>{tr('settings.reminderTime')}</Text>
            <View style={[styles.timeChip, { backgroundColor: t.colors.cardAlt }]}>
              <Ionicons name="time-outline" size={16} color={t.colors.primary} />
              <Text style={[styles.timeChipTxt, { color: t.colors.text }]}>
                {fmtTime(reminderHour, reminderMinute)}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </Card>

      <Dialog visible={timePicker} onClose={() => setTimePicker(false)} title={tr('settings.reminderTime')}>
        <View style={styles.timeWheels}>
          <Stepper value={tmpHour} onChange={(v) => setTmpHour((v + 24) % 24)} label={String(tmpHour).padStart(2, '0')} t={t} />
          <Text style={[styles.timeColon, { color: t.colors.text }]}>:</Text>
          <Stepper value={tmpMinute} onChange={(v) => setTmpMinute((v + 60) % 60)} step={5} label={String(tmpMinute).padStart(2, '0')} t={t} />
        </View>
        <Button
          label={tr('common.save')}
          full
          onPress={() => {
            setTimePicker(false);
            void applyReminder(true, tmpHour, tmpMinute);
          }}
        />
      </Dialog>
    </ScrollView>
  );
}

function Stepper({
  value,
  onChange,
  label,
  step = 1,
  t,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  step?: number;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(value + step)} hitSlop={8}>
        <Ionicons name="chevron-up" size={28} color={t.colors.primary} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: t.colors.text }]}>{label}</Text>
      <Pressable onPress={() => onChange(value - step)} hitSlop={8}>
        <Ionicons name="chevron-down" size={28} color={t.colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '600' },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  timeChipTxt: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  timeModal: { width: '100%', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  timeWheels: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  timeColon: { fontSize: 32, fontWeight: '800' },
  stepper: { alignItems: 'center', gap: 4 },
  stepperValue: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'center' },
});
