import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '@/store/useStore';
import { GoalType } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, Card, ProgressBar } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { computeGoalProgress } from '@/lib/stats';

interface GoalMeta {
  icon: keyof typeof Ionicons.glyphMap;
  suggestion: number;
  titleKey: string;
  hintKey: string;
  labelKey: string;
  unitKey: string;
}

const GOAL_META: Record<GoalType, GoalMeta> = {
  books_per_year: {
    icon: 'book',
    suggestion: 24,
    titleKey: 'goals.booksPerYear',
    hintKey: 'goals.booksHint',
    labelKey: 'goals.booksLabel',
    unitKey: 'unit.books',
  },
  minutes_per_day: {
    icon: 'time',
    suggestion: 30,
    titleKey: 'goals.minutesPerDay',
    hintKey: 'goals.minutesHint',
    labelKey: 'goals.minutesLabel',
    unitKey: 'unit.min',
  },
  pages_per_day: {
    icon: 'document-text',
    suggestion: 20,
    titleKey: 'goals.pagesPerDay',
    hintKey: 'goals.pagesHint',
    labelKey: 'goals.pagesLabel',
    unitKey: 'unit.pages',
  },
};

const TYPES: GoalType[] = ['books_per_year', 'minutes_per_day', 'pages_per_day'];

export default function GoalsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const books = useStore((s) => s.books);
  const sessions = useStore((s) => s.sessions);
  const goals = useStore((s) => s.goals);
  const setGoal = useStore((s) => s.setGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);

  const [editing, setEditing] = useState<GoalType | null>(null);
  const year = new Date().getFullYear();

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
      <Text style={[styles.intro, { color: t.colors.textMuted }]}>
        {tr('goals.intro')}
      </Text>

      {TYPES.map((type) => {
        const goal = goals.find(
          (g) => g.type === type && (type === 'books_per_year' ? g.year === year : true)
        );
        const meta = GOAL_META[type];
        if (!goal) {
          return (
            <Card key={type} style={{ gap: spacing.md }}>
              <View style={styles.cardHead}>
                <View style={[styles.iconBubble, { backgroundColor: t.colors.cardAlt }]}>
                  <Ionicons name={meta.icon} size={20} color={t.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: t.colors.text }]}>{tr(meta.titleKey)}</Text>
                  <Text style={[styles.cardHint, { color: t.colors.textFaint }]}>{tr(meta.hintKey)}</Text>
                </View>
              </View>
              <Button
                label={tr('goals.set')}
                variant="secondary"
                icon="add"
                full
                onPress={() => setEditing(type)}
              />
            </Card>
          );
        }

        const prog = computeGoalProgress(goal, books, sessions);
        const ratio = goal.target > 0 ? prog.current / goal.target : 0;
        const done = prog.current >= goal.target;
        return (
          <Card key={type} style={{ gap: spacing.md }}>
            <View style={styles.cardHead}>
              <View style={[styles.iconBubble, { backgroundColor: t.colors.cardAlt }]}>
                <Ionicons name={meta.icon} size={20} color={done ? t.colors.success : t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: t.colors.text }]}>{tr(meta.titleKey)}</Text>
                <Text style={[styles.cardHint, { color: t.colors.textFaint }]}>{tr(meta.labelKey)}</Text>
              </View>
              <Pressable onPress={() => setEditing(type)} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={t.colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.bigRow}>
              <Text style={[styles.bigNum, { color: done ? t.colors.success : t.colors.text }]}>
                {prog.current}
              </Text>
              <Text style={[styles.target, { color: t.colors.textMuted }]}>
                / {goal.target} {tr(meta.unitKey)}
              </Text>
              {done ? <Ionicons name="checkmark-circle" size={24} color={t.colors.success} /> : null}
            </View>

            <ProgressBar
              progress={ratio}
              height={10}
              color={done ? t.colors.success : t.colors.primary}
            />
            <Text style={[styles.pct, { color: t.colors.textFaint }]}>
              {tr('goals.completed', { pct: Math.round(Math.min(1, ratio) * 100) })}
            </Text>
          </Card>
        );
      })}

      <EditGoalModal
        type={editing}
        current={
          editing
            ? goals.find(
                (g) => g.type === editing && (editing === 'books_per_year' ? g.year === year : true)
              )?.target
            : undefined
        }
        onClose={() => setEditing(null)}
        onSave={(type, target) => {
          if (target > 0) {
            setGoal(type, target);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setEditing(null);
        }}
        onDelete={(type) => {
          const g = goals.find(
            (x) => x.type === type && (type === 'books_per_year' ? x.year === year : true)
          );
          if (g) deleteGoal(g.id);
          setEditing(null);
        }}
      />
    </ScrollView>
  );
}

function EditGoalModal({
  type,
  current,
  onClose,
  onSave,
  onDelete,
}: {
  type: GoalType | null;
  current?: number;
  onClose: () => void;
  onSave: (type: GoalType, target: number) => void;
  onDelete: (type: GoalType) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [val, setVal] = useState('');
  if (!type) return null;
  const meta = GOAL_META[type];

  return (
    <Dialog
      visible
      onClose={onClose}
      title={tr(meta.titleKey)}
      onShow={() => setVal(String(current ?? meta.suggestion))}
    >
      <TextInput
        value={val}
        onChangeText={setVal}
        keyboardType="numeric"
        autoFocus
        selectTextOnFocus
        style={[styles.input, { backgroundColor: t.colors.cardAlt, color: t.colors.text }]}
      />
      <Button label={tr('goals.save')} full onPress={() => onSave(type, parseInt(val, 10) || 0)} />
      {current != null ? (
        <Button label={tr('goals.remove')} variant="ghost" full onPress={() => onDelete(type)} />
      ) : null}
    </Dialog>
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
  pct: { fontSize: 12 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modal: { width: '100%', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
});
