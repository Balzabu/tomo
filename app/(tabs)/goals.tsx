import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '@/components/ThemedTextInput';
import { Alert } from '@/components/AppAlert';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '@/store/useStore';
import { Goal, GoalMetric, GoalPeriod } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { formatDateKey, formatInt, numUnitSep, useTranslation, wordSep } from '@/i18n';
import { Button, Card, Pill, ProgressBar, SectionTitle } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { Segmented } from '@/components/Segmented';
import { DatePickerDialog } from '@/components/DatePickerDialog';
import { daysInclusive, goalProgress, GoalProgress, isValidPairing } from '@/lib/goals';
import { dateKeyToDate, toDateKey } from '@/lib/utils';
import { readingDayKey } from '@/lib/readingDay';
import { useDayStartHour, useTodayKey } from '@/lib/useTodayKey';
import { goalTitle, unitFor } from '@/lib/goalText';

const METRIC_ICON: Record<GoalMetric, keyof typeof Ionicons.glyphMap> = {
  books: 'book',
  pages: 'document-text',
  minutes: 'time',
};

const SUGGESTION: Record<GoalMetric, Record<GoalPeriod, number>> = {
  books: { day: 1, month: 2, year: 24, custom: 3 },
  pages: { day: 20, month: 600, year: 7000, custom: 300 },
  minutes: { day: 30, month: 900, year: 10000, custom: 600 },
};

const PERIOD_ORDER: GoalPeriod[] = ['day', 'month', 'year', 'custom'];

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n, 12).getTime());
}

export default function GoalsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const books = useStore((s) => s.books);
  const sessions = useStore((s) => s.sessions);
  const goals = useStore((s) => s.goals);
  const saveGoal = useStore((s) => s.saveGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);

  // null = closed; {} = new goal; {goal} = editing; {preset} = quick-add
  const [editor, setEditor] = useState<null | { goal?: Goal; preset?: { metric: GoalMetric; period: GoalPeriod } }>(null);
  const [showEnded, setShowEnded] = useState(false);
  // Goals are anchored to "today"; the tab can stay mounted across midnight,
  // so re-anchor on every focus (same idea as the stats tab).
  const todayKey = useTodayKey();
  const dayStartHour = useDayStartHour();

  const progress = useMemo(
    () => goals.map((g) => goalProgress(g, books, sessions, todayKey)),
    [goals, books, sessions, todayKey, dayStartHour]
  );
  const byPeriod = (p: GoalPeriod) =>
    progress
      .filter((x) => x.goal.period === p)
      .sort((a, b) => ['books', 'pages', 'minutes'].indexOf(a.goal.metric) - ['books', 'pages', 'minutes'].indexOf(b.goal.metric));
  const challenges = progress
    .filter((x) => x.goal.period === 'custom' && x.window.end >= todayKey)
    .sort((a, b) => a.window.end.localeCompare(b.window.end));
  const ended = progress
    .filter((x) => x.goal.period === 'custom' && x.window.end < todayKey)
    .sort((a, b) => b.window.end.localeCompare(a.window.end));

  const confirmDelete = (g: Goal) => {
    setEditor(null);
    Alert.alert(tr('goals.removeTitle'), tr('goals.removeMsg'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('goals.remove'), style: 'destructive', onPress: () => deleteGoal(g.id) },
    ]);
  };

  const sections: { key: string; title: string; items: GoalProgress[] }[] = [
    { key: 'day', title: tr('goals.section.day'), items: byPeriod('day') },
    { key: 'month', title: tr('goals.section.month'), items: byPeriod('month') },
    { key: 'year', title: tr('goals.section.year'), items: byPeriod('year') },
    { key: 'custom', title: tr('goals.section.custom'), items: challenges },
  ];
  const empty = goals.length === 0;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
      <Text style={[styles.intro, { color: t.colors.textMuted }]}>{tr('goals.intro')}</Text>

      {empty ? (
        <View style={{ gap: spacing.md }}>
          {(
            [
              ['books', 'year', 'goals.booksHint'],
              ['minutes', 'day', 'goals.minutesHint'],
              ['pages', 'day', 'goals.pagesHint'],
            ] as const
          ).map(([metric, period, hint]) => (
            <Card key={metric + period} style={{ gap: spacing.md }}>
              <View style={styles.cardHead}>
                <View style={[styles.iconBubble, { backgroundColor: t.colors.cardAlt }]}>
                  <Ionicons name={METRIC_ICON[metric]} size={20} color={t.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: t.colors.text }]}>{tr(`goals.title.${metric}.${period}`)}</Text>
                  <Text style={[styles.cardHint, { color: t.colors.textFaint }]}>{tr(hint)}</Text>
                </View>
              </View>
              <Button label={tr('goals.set')} variant="secondary" icon="add" full onPress={() => setEditor({ preset: { metric, period } })} />
            </Card>
          ))}
        </View>
      ) : (
        sections.map((sec) =>
          sec.items.length === 0 ? null : (
            <View key={sec.key} style={{ gap: spacing.md }}>
              <SectionTitle>{sec.title}</SectionTitle>
              {sec.items.map((p) => (
                <GoalCard key={p.goal.id} p={p} today={todayKey} onEdit={() => setEditor({ goal: p.goal })} />
              ))}
            </View>
          )
        )
      )}

      <Button label={empty ? tr('goals.newChallenge') : tr('goals.new')} icon="add" full onPress={() => setEditor(empty ? { preset: { metric: 'books', period: 'custom' } } : {})} />

      {ended.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Pressable onPress={() => setShowEnded((v) => !v)} style={styles.endedHead} accessibilityRole="button">
            <Text style={[styles.endedTitle, { color: t.colors.textMuted }]}>{tr('goals.ended', { n: ended.length })}</Text>
            <Ionicons name={showEnded ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.textMuted} />
          </Pressable>
          {showEnded ? ended.map((p) => <GoalCard key={p.goal.id} p={p} today={todayKey} onEdit={() => confirmDelete(p.goal)} ended />) : null}
        </View>
      ) : null}

      <GoalEditor
        state={editor}
        onClose={() => setEditor(null)}
        onSave={(input) => {
          saveGoal(input);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditor(null);
        }}
        onDelete={confirmDelete}
        existing={goals}
      />
    </ScrollView>
  );
}

function GoalCard({ p, today, onEdit, ended }: { p: GoalProgress; today: string; onEdit: () => void; ended?: boolean }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const { goal } = p;
  const done = p.state === 'done';
  const ratio = goal.target > 0 ? p.current / goal.target : 0;
  const color = done ? t.colors.success : p.pace === 'behind' || p.state === 'ended' ? t.colors.star : t.colors.primary;

  const subtitle =
    goal.period === 'custom'
      ? `${formatDateKey(p.window.start, lang)} – ${formatDateKey(p.window.end, lang)}`
      : tr(`goals.window.${goal.period}`);

  let status: string;
  if (done) status = tr('goals.status.done');
  else if (p.state === 'upcoming') {
    const n = daysInclusive(today, p.window.start) - 1;
    status = n === 1 ? tr('goals.status.startsTomorrow') : tr('goals.status.startsIn', { n });
  } else if (p.state === 'ended') status = tr('goals.status.ended', { pct: Math.round(Math.min(1, ratio) * 100) });
  else if (goal.period === 'day') {
    const left = goal.target - p.current;
    status = tr('goals.status.leftToday', { n: formatInt(left, lang), unit: unitFor(goal.metric, left, tr) });
  } else {
    const parts: string[] = [];
    const d = Math.abs(p.delta ?? 0);
    if (p.pace === 'ahead') parts.push(tr('goals.status.ahead', { n: formatInt(d, lang), unit: unitFor(goal.metric, d, tr) }));
    else if (p.pace === 'behind') parts.push(tr('goals.status.behind', { n: formatInt(d, lang), unit: unitFor(goal.metric, d, tr) }));
    else parts.push(tr('goals.status.onTrack'));
    parts.push(p.daysLeft === 1 ? tr('goals.status.lastDay') : tr('goals.status.daysLeft', { n: p.daysLeft }));
    if (p.pace !== 'ahead' && p.perDay) {
      if (goal.metric === 'books') {
        const every = p.perDay >= 1 ? 0 : Math.max(1, Math.floor(1 / p.perDay));
        parts.push(
          every > 1
            ? tr('goals.status.bookEvery', { n: every })
            : tr('goals.status.perDay', { n: formatInt(Math.ceil(p.perDay), lang), unit: unitFor('books', Math.ceil(p.perDay), tr) })
        );
      } else {
        const n = Math.ceil(p.perDay);
        parts.push(tr('goals.status.perDay', { n: formatInt(n, lang), unit: unitFor(goal.metric, n, tr) }));
      }
    }
    status = parts.join(' · ');
  }

  return (
    <Card style={{ gap: spacing.md, opacity: ended && !done ? 0.8 : 1 }}>
      <View style={styles.cardHead}>
        <View style={[styles.iconBubble, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name={goal.period === 'custom' ? 'trophy' : METRIC_ICON[goal.metric]} size={20} color={done ? t.colors.success : t.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
            {goalTitle(goal, tr)}
          </Text>
          <Text style={[styles.cardHint, { color: t.colors.textFaint }]}>{subtitle}</Text>
        </View>
        <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={ended ? tr('goals.remove') : tr('book.editLabel')}>
          <Ionicons name={ended ? 'trash-outline' : 'create-outline'} size={20} color={t.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.bigRow}>
        <Text style={[styles.bigNum, { color: done ? t.colors.success : t.colors.text }]}>{formatInt(p.current, lang)}</Text>
        <Text style={[styles.target, { color: t.colors.textMuted }]}>
          / {formatInt(goal.target, lang)}{numUnitSep(lang)}{unitFor(goal.metric, goal.target, tr)}
        </Text>
        {done ? <Ionicons name="checkmark-circle" size={24} color={t.colors.success} /> : null}
      </View>
      <ProgressBar progress={ratio} height={10} color={color} />
      <Text style={[styles.status, { color: done ? t.colors.success : p.pace === 'behind' ? t.colors.star : t.colors.textMuted }]}>
        {status}
      </Text>
    </Card>
  );
}

type SaveInput = Parameters<ReturnType<typeof useStore.getState>['saveGoal']>[0];

function GoalEditor({
  state,
  onClose,
  onSave,
  onDelete,
  existing,
}: {
  state: null | { goal?: Goal; preset?: { metric: GoalMetric; period: GoalPeriod } };
  onClose: () => void;
  onSave: (input: SaveInput) => void;
  onDelete: (g: Goal) => void;
  existing: Goal[];
}) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const [metric, setMetric] = useState<GoalMetric>('books');
  const [period, setPeriod] = useState<GoalPeriod>('year');
  const [val, setVal] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => readingDayKey());
  const [end, setEnd] = useState(() => readingDayKey());
  const [picking, setPicking] = useState<null | 'start' | 'end'>(null);
  const [touched, setTouched] = useState(false);

  const editing = state?.goal;
  const today = readingDayKey();

  const seed = () => {
    const g = state?.goal;
    const m = g?.metric ?? state?.preset?.metric ?? 'books';
    const p = g?.period ?? state?.preset?.period ?? 'year';
    setMetric(m);
    setPeriod(p);
    setVal(String(g?.target ?? SUGGESTION[m][p]));
    setName(g?.name ?? '');
    setStart(g?.start ?? today);
    setEnd(g?.end ?? addDays(today, 29));
    setTouched(!!g);
  };

  // Switching kind re-suggests a sensible target until the user types one.
  const pick = (m: GoalMetric, p: GoalPeriod) => {
    const valid = isValidPairing(m, p) ? p : 'month';
    setMetric(m);
    setPeriod(valid);
    if (!touched) setVal(String(SUGGESTION[m][valid]));
  };

  const target = parseInt(val, 10) || 0;
  const replaces =
    !editing && period !== 'custom' ? existing.find((g) => g.metric === metric && g.period === period) : undefined;
  const lockedKind = !!editing; // editing keeps its kind: delete + new to change it

  const presets: { key: string; end: string; start?: string }[] = (() => {
    const d = dateKeyToDate(today);
    const toSunday = (7 - d.getDay()) % 7;
    const monthEnd = toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getTime());
    return [
      { key: 'goals.preset.week', end: addDays(today, toSunday) },
      { key: 'goals.preset.days30', end: addDays(today, 29) },
      { key: 'goals.preset.month', end: monthEnd },
      { key: 'goals.preset.year', end: `${today.slice(0, 4)}-12-31` },
    ];
  })();

  // Two presets can give the same range (e.g. "30 days" on the 2nd of a
  // 31-day month): highlight only the first.
  const activePreset = start === today ? presets.find((p) => p.end === end)?.key : undefined;

  if (!state) return null;
  const submit = () =>
    onSave({
      id: editing?.id,
      metric,
      period,
      target,
      ...(period === 'custom' ? { start, end, name } : {}),
    });
  return (
    <Dialog
      visible
      onClose={onClose}
      onShow={seed}
      title={editing ? tr('goals.edit') : tr('goals.new')}
      footer={
        <View style={styles.footer}>
          {editing ? (
            <Pressable onPress={() => onDelete(editing)} hitSlop={8} style={styles.delete} accessibilityRole="button" accessibilityLabel={tr('goals.remove')}>
              <Ionicons name="trash-outline" size={20} color={t.colors.danger} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label={tr('goals.save')} icon="checkmark" full disabled={target <= 0} onPress={submit} />
          </View>
        </View>
      }
    >
      {!lockedKind ? (
        <>
          <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('goals.what')}</Text>
          <Segmented
            value={metric}
            onChange={(m) => pick(m, period)}
            options={(['books', 'pages', 'minutes'] as GoalMetric[]).map((m) => ({ value: m, label: tr(`goals.metric.${m}`), icon: METRIC_ICON[m] }))}
          />
          <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('goals.when')}</Text>
          <Segmented
            value={period}
            onChange={(p) => pick(metric, p)}
            options={PERIOD_ORDER.map((p) => ({ value: p, label: tr(`goals.period.${p}`), disabled: !isValidPairing(metric, p) }))}
          />
        </>
      ) : (
        <View style={[styles.kindChip, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name={period === 'custom' ? 'trophy' : METRIC_ICON[metric]} size={16} color={t.colors.primary} />
          <Text style={[styles.kindText, { color: t.colors.text }]}>
            {period === 'custom' ? tr('goals.period.custom') : tr(`goals.title.${metric}.${period}`)}
          </Text>
        </View>
      )}

      {period === 'custom' ? (
        <View style={[styles.challenge, { borderColor: t.colors.border }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={tr('goals.namePlaceholder')}
            placeholderTextColor={t.colors.textFaint}
            maxLength={60}
            style={[styles.nameInput, { backgroundColor: t.colors.cardAlt, color: t.colors.text }]}
          />
          {/* Wrapped, not scrolled: longer translations must stay visible. */}
          <View style={styles.presetRow}>
            {presets.map((p) => (
              <Pill key={p.key} label={tr(p.key)} active={p.key === activePreset} onPress={() => { setStart(today); setEnd(p.end); }} />
            ))}
          </View>
          <View style={styles.dateRow}>
            <DateField label={tr('goals.from')} value={formatDateKey(start, lang)} onPress={() => setPicking('start')} />
            <Ionicons name="arrow-forward" size={16} color={t.colors.textFaint} />
            <DateField label={tr('goals.to')} value={formatDateKey(end, lang)} onPress={() => setPicking('end')} />
          </View>
          <Text style={[styles.hint, { color: t.colors.textFaint, textAlign: 'center' }]}>{tr('goals.lasts', { n: daysInclusive(start, end) })}</Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('goals.target')}</Text>
      <View style={styles.stepRow}>
        <Stepper icon="remove" onPress={() => { setTouched(true); setVal(String(Math.max(1, target - step(metric, period)))); }} />
        <View style={[styles.targetBox, { backgroundColor: t.colors.cardAlt }]}>
          <TextInput
            value={val}
            onChangeText={(v) => { setTouched(true); setVal(v.replace(/[^0-9]/g, '')); }}
            keyboardType="number-pad"
            selectTextOnFocus
            style={[styles.input, { color: t.colors.text }]}
          />
          <Text style={[styles.unit, { color: t.colors.textMuted }]} numberOfLines={1}>
            {[unitFor(metric, target, tr), period === 'custom' ? '' : tr(`goals.per.${period}`)].filter(Boolean).join(wordSep(lang))}
          </Text>
        </View>
        <Stepper icon="add" onPress={() => { setTouched(true); setVal(String(target + step(metric, period))); }} />
      </View>
      {replaces ? (
        <View style={[styles.note, { backgroundColor: t.colors.cardAlt }]}>
          <Ionicons name="information-circle-outline" size={16} color={t.colors.textMuted} />
          <Text style={[styles.hint, { color: t.colors.textMuted, flex: 1 }]}>{tr('goals.replaces', { n: formatInt(replaces.target, lang) })}</Text>
        </View>
      ) : null}

      <DatePickerDialog
        visible={picking != null}
        title={picking === 'start' ? tr('goals.from') : tr('goals.to')}
        value={picking === 'start' ? start : end}
        min={picking === 'end' ? start : undefined}
        onClose={() => setPicking(null)}
        onPick={(k) => {
          if (picking === 'start') {
            setStart(k);
            if (end < k) setEnd(k);
          } else setEnd(k);
          setPicking(null);
        }}
      />
    </Dialog>
  );
}

function step(metric: GoalMetric, period: GoalPeriod): number {
  if (metric === 'books') return 1;
  if (period === 'day') return 5;
  if (period === 'year') return metric === 'pages' ? 500 : 600;
  return metric === 'pages' ? 50 : 60;
}

function Stepper({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.stepper, { backgroundColor: t.colors.cardAlt }]}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={22} color={t.colors.text} />
    </Pressable>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.dateField, { backgroundColor: t.colors.cardAlt }]} accessibilityRole="button">
      <Text style={[styles.hint, { color: t.colors.textFaint }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="calendar-outline" size={16} color={t.colors.primary} />
        <Text style={{ color: t.colors.text, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardHint: { fontSize: 12, marginTop: 1 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bigNum: { fontSize: 36, fontWeight: '800' },
  target: { fontSize: 16, fontWeight: '600', flex: 1 },
  status: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  endedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  endedTitle: { fontSize: 14, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nameInput: { borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 15 },
  challenge: { gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  delete: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  kindChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  kindText: { fontSize: 14, fontWeight: '700' },
  targetBox: { flex: 1, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  unit: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  dateField: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepper: { width: 52, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    height: 44,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
});
