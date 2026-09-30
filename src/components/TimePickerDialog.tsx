import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Dialog } from '@/components/Dialog';
import { Button, Pill } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const PRESETS: [number, number][] = [
  [7, 30],
  [13, 0],
  [18, 30],
  [21, 0],
  [22, 30],
];

/** Hours and minutes with big steppers (hold to repeat) and quick presets. */
export function TimePickerDialog({
  visible,
  title,
  hour,
  minute,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  hour: number;
  minute: number;
  onClose: () => void;
  onSave: (h: number, m: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      onShow={() => {
        setH(hour);
        setM(minute);
      }}
      footer={<Button label={tr('common.save')} full onPress={() => onSave(h, m)} />}
    >
      <View style={styles.clock}>
        <Column value={h} label={pad(h)} onStep={(d) => setH((v) => (v + d + 24) % 24)} />
        <Text style={[styles.colon, { color: t.colors.textFaint }]}>:</Text>
        <Column value={m} label={pad(m)} onStep={(d) => setM((v) => (v + d * 5 + 60) % 60)} />
      </View>
      <View style={styles.presets}>
        {PRESETS.map(([ph, pm]) => (
          <Pill
            key={`${ph}${pm}`}
            label={`${pad(ph)}:${pad(pm)}`}
            active={ph === h && pm === m}
            onPress={() => {
              setH(ph);
              setM(pm);
            }}
          />
        ))}
      </View>
    </Dialog>
  );
}

function Column({ label, onStep }: { value: number; label: string; onStep: (d: number) => void }) {
  const t = useTheme();
  return (
    <View style={styles.column}>
      <Stepper icon="chevron-up" onStep={() => onStep(1)} />
      <View style={[styles.digits, { backgroundColor: t.colors.cardAlt }]}>
        <Text style={[styles.value, { color: t.colors.text }]}>{label}</Text>
      </View>
      <Stepper icon="chevron-down" onStep={() => onStep(-1)} />
    </View>
  );
}

/** Tap to step once; hold to keep stepping. */
function Stepper({ icon, onStep }: { icon: 'chevron-up' | 'chevron-down'; onStep: () => void }) {
  const t = useTheme();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onStep();
      }}
      onLongPress={() => {
        stop();
        timer.current = setInterval(onStep, 90);
      }}
      onPressOut={stop}
      hitSlop={6}
      style={({ pressed }) => [styles.stepper, { backgroundColor: pressed ? t.colors.cardAlt : 'transparent' }]}
      accessibilityRole="adjustable"
    >
      <Ionicons name={icon} size={26} color={t.colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  column: { alignItems: 'center', gap: spacing.xs },
  digits: { width: 96, height: 76, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  colon: { fontSize: 40, fontWeight: '800', marginTop: -4 },
  stepper: { width: 56, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
});
