import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Book, ReadingSession } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { formatDateKey, formatInt, useTranslation } from '@/i18n';
import { ProgressBar } from '@/components/ui';
import { DatePickerDialog } from '@/components/DatePickerDialog';
import { planProgress } from '@/lib/plan';
import { useDayStartHour, useTodayKey } from '@/lib/useTodayKey';
import { useStore } from '@/store/useStore';

/**
 * "Finish by …" for one book: today's page quota (recomputed each day from
 * what's left), and whether you're ahead of or behind an even schedule.
 */
export function PlanBox({ book, sessions }: { book: Book; sessions: ReadingSession[] }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const [picking, setPicking] = useState(false);
  const today = useTodayKey();
  const dayStartHour = useDayStartHour();
  const p = useMemo(
    () => planProgress(book, sessions, today),
    [book, sessions, today, dayStartHour]
  );
  const open = book.status === 'reading' || book.status === 'paused' || book.status === 'want_to_read';
  if (!book.pageCount || (!open && !book.plan)) return null;
  if (!open && p?.status !== 'done') return null;

  const setTarget = (target: string) => {
    void Haptics.selectionAsync();
    // Changing the deadline re-plans from today and where you are now.
    useStore.getState().updateBook(book.id, { plan: { target, start: today, startPage: book.currentPage } });
    setPicking(false);
  };
  const clear = () => {
    useStore.getState().updateBook(book.id, { plan: undefined });
    setPicking(false);
  };
  const picker = (
    <DatePickerDialog
      visible={picking}
      title={tr('plan.pickTitle')}
      value={book.plan?.target}
      min={today}
      onPick={setTarget}
      onClose={() => setPicking(false)}
      onClear={book.plan ? clear : undefined}
    />
  );

  if (!p) {
    if (book.currentPage >= book.pageCount) return null;
    return (
      <>
        <Pressable
          onPress={() => setPicking(true)}
          style={[styles.cta, { borderColor: t.colors.border }]}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={18} color={t.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: t.colors.text }]}>{tr('plan.cta')}</Text>
            <Text style={[styles.small, { color: t.colors.textFaint }]}>{tr('plan.ctaSub')}</Text>
          </View>
          <Ionicons name="add" size={20} color={t.colors.primary} />
        </Pressable>
        {picker}
      </>
    );
  }

  const quotaDone = p.todayTarget > 0 && p.todayRead >= p.todayTarget;
  const tone =
    p.status === 'done' || p.status === 'ahead' ? t.colors.success : p.status === 'behind' || p.status === 'overdue' ? t.colors.star : t.colors.primary;
  const unit = (n: number) => tr('unit.pages', { n });
  const statusText =
    p.status === 'done'
      ? tr('plan.done')
      : p.status === 'overdue'
      ? tr('plan.overdue', { n: formatInt(p.pagesLeft, lang), unit: unit(p.pagesLeft) })
      : p.status === 'ahead'
      ? tr('plan.ahead', { n: formatInt(p.delta, lang), unit: unit(p.delta) })
      : p.status === 'behind'
      ? tr('plan.behind', { n: formatInt(-p.delta, lang), unit: unit(-p.delta) })
      : tr('plan.onTrack');

  return (
    <View style={[styles.box, { backgroundColor: t.colors.bg, borderColor: t.colors.border }]}>
      <Pressable onPress={() => setPicking(true)} style={styles.head} accessibilityRole="button" accessibilityLabel={tr('plan.edit')}>
        <Ionicons name="flag-outline" size={16} color={t.colors.primary} />
        <Text style={[styles.headTxt, { color: t.colors.text }]}>
          {tr('plan.by', { date: formatDateKey(p.target, lang) })}
          {p.daysLeft > 0 && p.status !== 'done'
            ? ` · ${p.daysLeft === 1 ? tr('plan.lastDay') : tr('plan.daysLeft', { n: p.daysLeft })}`
            : ''}
        </Text>
        <Ionicons name="create-outline" size={16} color={t.colors.textMuted} />
      </Pressable>
      {p.status !== 'done' && p.status !== 'overdue' ? (
        <>
          <View style={styles.todayRow}>
            <Text style={[styles.small, { color: t.colors.textMuted }]}>{tr('plan.today')}</Text>
            <Text style={[styles.todayVal, { color: quotaDone ? t.colors.success : t.colors.text }]}>
              {quotaDone
                ? tr('plan.quotaDone')
                : `${formatInt(p.todayRead, lang)} / ${formatInt(p.todayTarget, lang)} ${unit(p.todayTarget)}`}
            </Text>
          </View>
          <ProgressBar progress={p.todayTarget ? p.todayRead / p.todayTarget : 1} height={6} color={quotaDone ? t.colors.success : t.colors.primary} />
        </>
      ) : null}
      <Text style={[styles.status, { color: tone }]}>{statusText}</Text>
      {picker}
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ctaTitle: { fontSize: 14, fontWeight: '700' },
  small: { fontSize: 12 },
  box: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headTxt: { flex: 1, fontSize: 14, fontWeight: '700' },
  todayRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  todayVal: { fontSize: 14, fontWeight: '800' },
  status: { fontSize: 13, fontWeight: '700' },
});
