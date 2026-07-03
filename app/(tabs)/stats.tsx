import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation, localizedWeekdaysShort } from '@/i18n';
import { buildHeatmap, computeInsights, computeStats, latestWrappedYear, recentDailyPages } from '@/lib/stats';
import { BarChart, Heatmap, StatTile } from '@/components/charts';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { dateKeyToDate, formatDuration, toDateKey } from '@/lib/utils';

export default function StatsScreen() {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const books = useStore((s) => s.books);
  const sessions = useStore((s) => s.sessions);

  // Every stat below is anchored to "today" (streak, heatmap window, weekly
  // chart), but the app can sit in memory across midnight for days. Refresh
  // the anchor on each tab focus so the memos can't serve yesterday's world.
  const [todayKey, setTodayKey] = useState(() => toDateKey());
  useFocusEffect(
    useCallback(() => {
      setTodayKey(toDateKey());
    }, [])
  );

  const stats = useMemo(() => computeStats(books, sessions), [books, sessions, todayKey]);
  const insights = useMemo(() => computeInsights(books, sessions), [books, sessions, todayKey]);
  const heat = useMemo(() => buildHeatmap(sessions, 17), [sessions, todayKey]);
  const monthDelta = insights.pagesThisMonth - insights.pagesLastMonth;
  const monthTrend = monthDelta > 0 ? ` ↑${monthDelta}` : monthDelta < 0 ? ` ↓${-monthDelta}` : '';
  const wrappedReady = useMemo(
    () => latestWrappedYear(books, sessions) != null,
    [books, sessions, todayKey]
  );
  const weekData = useMemo(() => {
    const weekdays = localizedWeekdaysShort(lang);
    const days = recentDailyPages(sessions, 7);
    return days.map((d) => {
      // Parse as a local date (new Date('YYYY-MM-DD') would be UTC midnight).
      const dow = (dateKeyToDate(d.date).getDay() + 6) % 7;
      return { label: weekdays[dow], value: d.pages, sub: d.date };
    });
  }, [sessions, lang, todayKey]);

  if (sessions.length === 0 && books.length === 0) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title={tr('stats.emptyTitle')}
        subtitle={tr('stats.emptySub')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
      <View style={styles.tiles}>
        <StatTile
          value={String(stats.finishedBooks)}
          label={tr('stats.booksRead')}
          icon={<Ionicons name="checkmark-done" size={18} color={t.colors.success} />}
        />
        <StatTile
          value={stats.totalPagesRead.toLocaleString()}
          label={tr('stats.pagesRead')}
          icon={<Ionicons name="document-text" size={18} color={t.colors.primary} />}
        />
        <StatTile
          value={formatDuration(stats.totalSeconds)}
          label={tr('stats.readingTime')}
          icon={<Ionicons name="time" size={18} color={t.colors.accent} />}
        />
        <StatTile
          value={`${stats.currentStreak}🔥`}
          label={tr('stats.currentStreak')}
          icon={<Ionicons name="flame" size={18} color={t.colors.danger} />}
        />
        <StatTile
          value={String(stats.longestStreak)}
          label={tr('stats.longestStreak')}
          icon={<Ionicons name="trophy" size={18} color={t.colors.star} />}
        />
        <StatTile
          value={stats.avgPagesPerHour > 0 ? `${Math.round(stats.avgPagesPerHour)}` : '-'}
          label={tr('stats.pagesPerHour')}
          icon={<Ionicons name="speedometer" size={18} color={t.colors.primary} />}
        />
      </View>

      {wrappedReady ? (
        <Button
          label={tr('stats.yearInReview')}
          icon="sparkles"
          full
          // typedRoutes regenerates /wrapped into the route union at bundle time.
          onPress={() => router.push('/wrapped' as Href)}
        />
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('stats.weeklyPages')}</SectionTitle>
        <BarChart data={weekData} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('stats.calendar')}</SectionTitle>
        <Heatmap cells={heat.cells} cols={heat.cols} />
        <View style={styles.legend}>
          <Text style={[styles.legendTxt, { color: t.colors.textFaint }]}>{tr('stats.less')}</Text>
          {[0, 1, 2, 3, 4].map((l) => (
            <View
              key={l}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor:
                  l === 0
                    ? t.colors.cardAlt
                    : withPrimaryAlpha(t.colors.primary, [0, 0.3, 0.5, 0.75, 1][l]),
              }}
            />
          ))}
          <Text style={[styles.legendTxt, { color: t.colors.textFaint }]}>{tr('stats.more')}</Text>
        </View>
      </Card>

      {insights.fastestBook ||
      insights.topCategory ||
      insights.pagesThisMonth > 0 ||
      insights.pagesLastMonth > 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <SectionTitle>{tr('stats.insights')}</SectionTitle>
          {insights.pagesThisMonth > 0 || insights.pagesLastMonth > 0 ? (
            <Row
              label={tr('stats.thisMonth')}
              value={`${insights.pagesThisMonth} ${tr('unit.pages')}${monthTrend}`}
              t={t}
            />
          ) : null}
          {insights.fastestBook ? (
            <Row
              label={tr('stats.fastestBook')}
              value={`${insights.fastestBook.pagesPerHour} ${tr('stats.pagesPerHour')}`}
              sub={insights.fastestBook.title}
              t={t}
            />
          ) : null}
          {insights.topCategory ? (
            <Row label={tr('stats.topGenre')} value={insights.topCategory.name} t={t} />
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <SectionTitle>{tr('stats.summary')}</SectionTitle>
        <Row label={tr('stats.totalBooks')} value={String(stats.totalBooks)} t={t} />
        <Row label={tr('stats.readingNow')} value={String(stats.readingBooks)} t={t} />
        <Row label={tr('stats.finishedThisYear')} value={String(stats.finishedThisYear)} t={t} />
        <Row label={tr('stats.totalSessions')} value={String(stats.totalSessions)} t={t} />
      </Card>
    </ScrollView>
  );
}

function withPrimaryAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function Row({
  label,
  value,
  sub,
  t,
}: {
  label: string;
  value: string;
  sub?: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: t.colors.textMuted }]}>{label}</Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: t.colors.textFaint }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.rowValue, { color: t.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendTxt: { fontSize: 11, marginHorizontal: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  rowLabel: { fontSize: 14 },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowValue: { fontSize: 15, fontWeight: '700', flexShrink: 0 },
});
