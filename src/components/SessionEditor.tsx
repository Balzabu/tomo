import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReadingSession } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation, formatDate } from '@/i18n';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/Dialog';

export interface SessionDraft {
  startPage?: number;
  endPage?: number;
  minutes: number;
  /** local day timestamp (midnight) the session happened on */
  dayTs: number;
}

interface Props {
  visible: boolean;
  /** existing session to edit, or null to add a new one */
  session?: ReadingSession | null;
  defaultStartPage?: number;
  /** prefill the minutes field when adding (ignored when editing a session) */
  defaultMinutes?: number;
  /** override the dialog title (defaults to add/edit) */
  title?: string;
  onClose: () => void;
  onSave: (draft: SessionDraft) => void;
}

const DAY = 86_400_000;

export function SessionEditor({
  visible,
  session,
  defaultStartPage,
  defaultMinutes,
  title,
  onClose,
  onSave,
}: Props) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const c = t.colors;

  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [minutes, setMinutes] = useState('');
  const [dayTs, setDayTs] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (session) {
      setStartPage(session.startPage != null ? String(session.startPage) : '');
      setEndPage(session.endPage != null ? String(session.endPage) : '');
      setMinutes(String(Math.max(1, Math.round(session.durationSeconds / 60))));
      const d = new Date(session.startTime);
      d.setHours(0, 0, 0, 0);
      setDayTs(d.getTime());
    } else {
      setStartPage(defaultStartPage != null ? String(defaultStartPage) : '');
      setEndPage('');
      setMinutes(defaultMinutes != null ? String(defaultMinutes) : '');
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      setDayTs(d.getTime());
    }
  }, [visible, session, defaultStartPage, defaultMinutes]);

  const mins = parseInt(minutes, 10);
  const canSave = Number.isFinite(mins) && mins > 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = dayTs >= today.getTime();

  const save = () => {
    if (!canSave) return;
    const sp = parseInt(startPage, 10);
    const ep = parseInt(endPage, 10);
    onSave({
      startPage: Number.isFinite(sp) ? sp : undefined,
      endPage: Number.isFinite(ep) ? ep : undefined,
      minutes: mins,
      dayTs,
    });
    onClose();
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title ?? (session ? tr('session.edit') : tr('session.add'))}
    >
      <View style={styles.dateRow}>
        <Pressable onPress={() => setDayTs((d) => d - DAY)} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <Text style={[styles.dateTxt, { color: c.text }]}>
          {isToday ? tr('session.today') : formatDate(dayTs, lang)}
        </Text>
        <Pressable
          onPress={() => setDayTs((d) => Math.min(today.getTime(), d + DAY))}
          hitSlop={8}
          style={{ opacity: isToday ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-forward" size={24} color={c.primary} />
        </Pressable>
      </View>

      <View style={styles.pagesRow}>
        <Field label={tr('timer.fromPage')} value={startPage} onChange={setStartPage} c={c} />
        <Ionicons name="arrow-forward" size={18} color={c.textFaint} />
        <Field label={tr('timer.toPage')} value={endPage} onChange={setEndPage} c={c} />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.textMuted }]}>{tr('session.minutes')}</Text>
        <TextInput
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="numeric"
          placeholder="30"
          placeholderTextColor={c.textFaint}
          style={[styles.input, { backgroundColor: c.cardAlt, color: c.text }]}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label={tr('common.cancel')} variant="ghost" full onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={tr('common.save')} full disabled={!canSave} onPress={save} />
        </View>
      </View>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  c,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  c: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
        style={[styles.input, { backgroundColor: c.cardAlt, color: c.text, textAlign: 'center' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modal: { width: '100%', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateTxt: { fontSize: 16, fontWeight: '700' },
  pagesRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  label: { fontSize: 13, fontWeight: '600' },
  input: { height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontWeight: '600' },
});
