import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '@/components/ThemedTextInput';
import { Ionicons } from '@expo/vector-icons';
import { ReadingSession } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation, formatDate } from '@/i18n';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { dateKeyToDate, MAX_SESSION_MINUTES, pagesError, parsePageField } from '@/lib/utils';
import { readingDayKey, sessionDay } from '@/lib/readingDay';

export interface SessionDraft {
  startPage?: number;
  endPage?: number;
  minutes: number;
  /** reading day the session counts for, as that date's local midnight */
  dayTs: number;
}

interface Props {
  visible: boolean;
  /** existing session to edit, or null to add a new one */
  session?: ReadingSession | null;
  defaultStartPage?: number;
  /** book length, used to reject page numbers past the end */
  pageCount?: number;
  /** prefill the minutes field when adding (ignored when editing a session) */
  defaultMinutes?: number;
  /** default day (any ms timestamp) when adding; falls back to today */
  defaultDayTs?: number;
  /** override the dialog title (defaults to add/edit) */
  title?: string;
  onClose: () => void;
  onSave: (draft: SessionDraft) => void;
}

/** Previous/next local midnight via calendar stepping - a fixed 24h offset
 *  lands on the wrong day across DST transitions (23h/25h days). */
function stepDay(base: number, delta: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function SessionEditor({
  visible,
  session,
  defaultStartPage,
  pageCount,
  defaultMinutes,
  defaultDayTs,
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
      setDayTs(dateKeyToDate(sessionDay(session)).getTime());
    } else {
      setStartPage(defaultStartPage != null ? String(defaultStartPage) : '');
      setEndPage('');
      setMinutes(defaultMinutes != null ? String(defaultMinutes) : '');
      setDayTs(dateKeyToDate(readingDayKey(defaultDayTs ?? Date.now())).getTime());
    }
  }, [visible, session, defaultStartPage, defaultMinutes, defaultDayTs]);

  const mins = parseInt(minutes, 10);
  const minutesOk = Number.isFinite(mins) && mins > 0 && mins <= MAX_SESSION_MINUTES;
  const minutesTooLong = Number.isFinite(mins) && mins > MAX_SESSION_MINUTES;
  const sp = parsePageField(startPage);
  const ep = parsePageField(endPage);
  const pageErr = pagesError(sp, ep, pageCount);
  const canSave = minutesOk && !pageErr;
  // Today's reading day: before the day start hour that is still yesterday.
  const today = dateKeyToDate(readingDayKey());
  const isToday = dayTs >= today.getTime();

  const save = () => {
    if (!canSave) return;
    onSave({ startPage: sp, endPage: ep, minutes: mins, dayTs });
    onClose();
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title ?? (session ? tr('session.edit') : tr('session.add'))}
    >
      <View style={styles.dateRow}>
        <Pressable onPress={() => setDayTs((d) => stepDay(d, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <Text style={[styles.dateTxt, { color: c.text }]}>
          {isToday ? tr('session.today') : formatDate(dayTs, lang)}
        </Text>
        <Pressable
          onPress={() => setDayTs((d) => Math.min(today.getTime(), stepDay(d, 1)))}
          hitSlop={8}
          style={{ opacity: isToday ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-forward" size={24} color={c.primary} />
        </Pressable>
      </View>

      <View style={styles.pagesRow}>
        <Field label={tr('timer.fromPage')} value={startPage} onChange={setStartPage} c={c} />
        {/* Same height as the inputs, so the arrow sits on their centre line. */}
        <View style={styles.arrowSlot}>
          <View style={[styles.arrow, { backgroundColor: c.cardAlt }]}>
            <Ionicons name="arrow-forward" size={16} color={c.textMuted} />
          </View>
        </View>
        <Field label={tr('timer.toPage')} value={endPage} onChange={setEndPage} c={c} />
      </View>
      {pageErr ? (
        <Text style={[styles.error, { color: c.danger }]}>
          {pageErr === 'order'
            ? tr('session.pageOrder')
            : tr('session.pageRange', { n: pageCount ?? 0 })}
        </Text>
      ) : null}

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
        {minutesTooLong ? (
          <Text style={[styles.error, { color: c.danger }]}>
            {tr('session.minutesMax', { n: MAX_SESSION_MINUTES })}
          </Text>
        ) : null}
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
  pagesRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  arrowSlot: { height: 48, justifyContent: 'center' },
  arrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  input: { height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontWeight: '600' },
});
