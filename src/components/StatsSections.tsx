import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Book, BookNote, ReadingSession } from '@/types';
import { spacing, useTheme } from '@/theme/theme';
import { durationUnits, formatDateKey, formatInt, formatMonthYear, labelValue, localizedWeekdaysShort, numUnitSep, useTranslation } from '@/i18n';
import { BarChart, HBarList } from '@/components/charts';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { CardShareModal } from '@/components/CardShareModal';
import { formatDuration } from '@/lib/utils';
import { useDayStartHour } from '@/lib/useTodayKey';
import {
  DAY_SLOTS,
  moodPace,
  ratingDistribution,
  readingRhythm,
  tbrForecast,
  topAuthors,
  yearOverYear,
  YearTotals,
} from '@/lib/statsExtra';

function fmt1(n: number, lang: string): string {
  try {
    return n.toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  } catch {
    return n.toFixed(1);
  }
}

/** This year so far vs. last year up to the same day. */
export function YearCompareCard({ books, sessions, today }: { books: Book[]; sessions: ReadingSession[]; today: string }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const dayStartHour = useDayStartHour();
  const { current, previous } = useMemo(
    () => yearOverYear(books, sessions, today),
    [books, sessions, today, dayStartHour]
  );
  if (previous.sessions === 0 && previous.books === 0) return null;
  const rows: { key: string; label: string; a: number; b: number; show: (n: number) => string }[] = [
    { key: 'books', label: tr('stats.booksRead'), a: current.books, b: previous.books, show: (n) => formatInt(n, lang) },
    { key: 'pages', label: tr('stats.pagesRead'), a: current.pages, b: previous.pages, show: (n) => formatInt(n, lang) },
    { key: 'time', label: tr('stats.readingTime'), a: current.seconds, b: previous.seconds, show: (n) => formatDuration(n, durationUnits(lang)) },
    { key: 'days', label: tr('stats.activeDays'), a: current.days, b: previous.days, show: (n) => formatInt(n, lang) },
  ];
  const rating = (y: YearTotals) => (y.avgRating != null ? `${fmt1(y.avgRating, lang)}★` : '–');
  return (
    <Card style={{ gap: spacing.sm }}>
      <SectionTitle>{tr('stats.yoyTitle', { a: current.year, b: previous.year })}</SectionTitle>
      <Text style={[styles.caption, { color: t.colors.textFaint }]}>
        {tr('stats.yoySub', { date: formatDateKey(today, lang, false) })}
      </Text>
      <View style={styles.yoyHead}>
        <View style={{ flex: 1 }} />
        <Text style={[styles.yoyCol, { color: t.colors.text }]}>{current.year}</Text>
        <Text style={[styles.yoyCol, { color: t.colors.textFaint }]}>{previous.year}</Text>
      </View>
      {rows.map((r) => {
        const up = r.a > r.b;
        const down = r.a < r.b;
        return (
          <View key={r.key} style={styles.yoyRow}>
            <Text style={[styles.rowLabel, { color: t.colors.textMuted, flex: 1 }]}>{r.label}</Text>
            <View style={[styles.yoyCell]}>
              <Text style={[styles.yoyVal, { color: t.colors.text }]}>{r.show(r.a)}</Text>
              {up || down ? (
                <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? t.colors.success : t.colors.danger} />
              ) : null}
            </View>
            <Text style={[styles.yoyCol, { color: t.colors.textFaint }]}>{r.show(r.b)}</Text>
          </View>
        );
      })}
      <View style={styles.yoyRow}>
        <Text style={[styles.rowLabel, { color: t.colors.textMuted, flex: 1 }]}>{tr('stats.avgRating')}</Text>
        <View style={styles.yoyCell}>
          <Text style={[styles.yoyVal, { color: t.colors.text }]}>{rating(current)}</Text>
        </View>
        <Text style={[styles.yoyCol, { color: t.colors.textFaint }]}>{rating(previous)}</Text>
      </View>
    </Card>
  );
}

/** When you read: time of day or day of week, with a one-line takeaway. */
export function RhythmCard({ sessions }: { sessions: ReadingSession[] }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const [mode, setMode] = useState<'hour' | 'day'>('hour');
  const dayStartHour = useDayStartHour();
  const r = useMemo(() => readingRhythm(sessions), [sessions, dayStartHour]);
  if (r.timedSessions < 3) return null;
  const units = durationUnits(lang);
  const short = (s: number) => (s >= 3600 ? `${Math.round(s / 3600)}${units.h}` : `${Math.round(s / 60)}${units.m}`);
  const topSlot = DAY_SLOTS.reduce((a, b) => (r.slots[b] > r.slots[a] ? b : a));
  const topDay = r.weekdays.indexOf(Math.max(...r.weekdays));
  const days = localizedWeekdaysShort(lang);
  const data =
    mode === 'hour'
      ? DAY_SLOTS.map((s) => ({ label: tr(`rhythm.slotShort.${s}`), value: r.slots[s], display: short(r.slots[s]), highlight: s === topSlot }))
      : r.weekdays.map((v, i) => ({ label: days[i], value: v, display: short(v), highlight: i === topDay }));
  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle
        right={
          <View style={{ width: 150 }}>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'hour', label: tr('rhythm.byHour') },
                { value: 'day', label: tr('rhythm.byDay') },
              ]}
            />
          </View>
        }
      >
        {tr('rhythm.title')}
      </SectionTitle>
      <Text style={[styles.takeaway, { color: t.colors.text }]}>
        {mode === 'hour' ? tr(`rhythm.type.${topSlot}`) : tr('rhythm.topDay', { day: tr(`rhythm.dayLong.${topDay}`) })}
      </Text>
      <BarChart data={data} height={130} />
    </Card>
  );
}

export function RatingsCard({ books }: { books: Book[] }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const d = useMemo(() => ratingDistribution(books), [books]);
  if (d.count === 0) return null;
  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle>{tr('stats.ratings')}</SectionTitle>
      <Text style={[styles.takeaway, { color: t.colors.text }]}>
        {tr('stats.ratingsAvg', { avg: fmt1(d.avg ?? 0, lang), n: d.count })}
      </Text>
      <HBarList
        color={t.colors.star}
        rows={[4, 3, 2, 1, 0].map((i) => ({
          key: String(i),
          label: (
            <Text style={{ color: t.colors.star, fontSize: 14, letterSpacing: 1 }}>
              {'★'.repeat(i + 1)}
              <Text style={{ color: t.colors.cardAlt }}>{'★'.repeat(4 - i)}</Text>
            </Text>
          ),
          value: d.buckets[i],
          display: String(d.buckets[i]),
        }))}
      />
    </Card>
  );
}

export function AuthorsCard({ books }: { books: Book[] }) {
  const { t: tr, lang } = useTranslation();
  const list = useMemo(() => topAuthors(books, 5), [books]);
  if (list.length === 0) return null;
  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle>{tr('stats.topAuthors')}</SectionTitle>
      <HBarList
        rows={list.map((a) => ({
          key: a.name,
          label: a.name,
          sub: a.pages > 0 ? `${formatInt(a.pages, lang)}${numUnitSep(lang)}${tr('unit.pages', { n: a.pages })}` : undefined,
          value: a.books,
          display: String(a.books),
        }))}
      />
    </Card>
  );
}

export function MoodPaceCard({ books }: { books: Book[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const mp = useMemo(() => moodPace(books), [books]);
  const paced = mp.pace.slow + mp.pace.medium + mp.pace.fast;
  if (mp.moods.length === 0 && paced === 0) return null;
  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle>{tr('stats.moodPace')}</SectionTitle>
      {mp.moods.length ? (
        <View style={styles.chips}>
          {mp.moods.slice(0, 8).map((m, i) => (
            <Pill key={m.mood} label={`${tr(`mood.${m.mood}`)} · ${m.count}`} active={i < 3} color={t.colors.accent} />
          ))}
        </View>
      ) : null}
      {paced > 0 ? (
        <HBarList
          color={t.colors.accent}
          rows={(['slow', 'medium', 'fast'] as const).map((p) => ({
            key: p,
            label: tr(`pace.${p}`),
            value: mp.pace[p],
            display: tr('common.percent', { n: Math.round((mp.pace[p] / paced) * 100) }),
          }))}
        />
      ) : null}
    </Card>
  );
}

const LEVEL_EMOJI = { empty: '✨', tidy: '🧹', healthy: '📚', collector: '🏯', master: '🐉', unknown: '📚' } as const;

/** The to-read pile: how long it lasts at your pace, and the tsundoku index. */
export function TbrCard({ books, today }: { books: Book[]; today: string }) {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const [share, setShare] = useState(false);
  const f = useMemo(() => tbrForecast(books, today), [books, today]);
  if (f.count === 0 && f.perMonth === 0) return null;
  const monthYear = (key: string) => formatMonthYear(key, lang);
  const sep = numUnitSep(lang);
  const years = f.index != null ? fmt1(f.index, lang) : '–';
  const level = `${LEVEL_EMOJI[f.level]} ${tr(`tbr.level.${f.level}`)}`;
  const pace = tr('tbr.pace', { n: fmt1(f.perMonth, lang) });

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle
        right={
          f.count > 0 ? (
            <Pressable onPress={() => setShare(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('wrapped.share')}>
              <Ionicons name="share-social-outline" size={20} color={t.colors.primary} />
            </Pressable>
          ) : null
        }
      >
        {tr('tbr.title')}
      </SectionTitle>
      {f.count === 0 ? (
        <Text style={[styles.takeaway, { color: t.colors.text }]}>{tr('tbr.empty')}</Text>
      ) : (
        <>
          <View style={styles.tbrTop}>
            <View style={styles.tbrStat}>
              <Text style={[styles.big, { color: t.colors.text }]}>{formatInt(f.count, lang)}</Text>
              <Text style={[styles.caption, { color: t.colors.textFaint }]}>{tr('tbr.books', { n: f.count })}</Text>
            </View>
            {f.pages > 0 ? (
              <View style={styles.tbrStat}>
                <Text style={[styles.big, { color: t.colors.text }]}>{formatInt(f.pages, lang)}</Text>
                <Text style={[styles.caption, { color: t.colors.textFaint }]}>{tr('tbr.pages', { n: f.pages })}</Text>
              </View>
            ) : null}
            <View style={styles.tbrStat}>
              <Text style={[styles.big, { color: t.colors.primary }]}>{years}</Text>
              <Text style={[styles.caption, { color: t.colors.textFaint }]}>{tr('tbr.index', { n: years })}</Text>
            </View>
          </View>
          <Text style={[styles.takeaway, { color: t.colors.text }]}>
            {f.clearDate ? tr('tbr.forecast', { pace, date: monthYear(f.clearDate) }) : tr('tbr.noPace')}
          </Text>
          <Text style={[styles.caption, { color: t.colors.textMuted }]}>{level}</Text>
        </>
      )}
      <CardShareModal
        visible={share}
        onClose={() => setShare(false)}
        content={{
          kind: 'stats',
          kicker: tr('share.kicker.tbr'),
          heading: tr('tbr.cardTitle'),
          // Two tiles + detail rows: the square format has room for one tile row
          // under a two-line heading.
          tiles: [
            { label: tr('tbr.books', { n: f.count }), value: formatInt(f.count, lang) },
            { label: tr('tbr.index', { n: years }), value: years },
          ],
          highlights: [
            ...(f.pages > 0 ? [{ label: tr('tbr.pagesLabel'), value: formatInt(f.pages, lang) }] : []),
            ...(f.clearDate ? [{ label: tr('tbr.clearBy'), value: monthYear(f.clearDate) }] : []),
            ...(f.perMonth > 0 ? [{ label: tr('tbr.paceLabel'), value: pace }] : []),
            { label: tr('tbr.levelLabel'), value: level },
          ],
        }}
        text={[
          `📚 ${tr('tbr.cardTitle')}`,
          `${formatInt(f.count, lang)}${sep}${tr('tbr.books', { n: f.count })}${f.pages ? ` · ${formatInt(f.pages, lang)}${sep}${tr('tbr.pages', { n: f.pages })}` : ''}`,
          f.clearDate ? labelValue(lang, tr('tbr.clearBy'), monthYear(f.clearDate)) : '',
          `${labelValue(lang, tr('tbr.index'), years)} · ${level}`,
        ]
          .filter(Boolean)
          .join('\n')}
      />
    </Card>
  );
}

/** Shortcut into the notes & quotes screen. */
export function NotesCard({ notes }: { notes: BookNote[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  if (notes.length === 0) return null;
  const quotes = notes.filter((n) => n.type === 'quote').length;
  return (
    <Pressable onPress={() => router.push('/notes')} accessibilityRole="button">
      <Card style={styles.notesCard}>
        <Ionicons name="chatbox-ellipses" size={22} color={t.colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.notesTitle, { color: t.colors.text }]}>{tr('notes.title')}</Text>
          <Text style={[styles.caption, { color: t.colors.textMuted }]}>
            {tr('stats.notesCount', { q: quotes, n: notes.length - quotes })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 12 },
  takeaway: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  rowLabel: { fontSize: 14 },
  yoyHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  yoyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  yoyCol: { width: 72, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  yoyCell: { width: 84, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 2 },
  yoyVal: { fontSize: 14, fontWeight: '800' },
  toggle: { flexDirection: 'row', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tbrTop: { flexDirection: 'row', gap: spacing.lg },
  tbrStat: { gap: 2 },
  big: { fontSize: 26, fontWeight: '800' },
  notesCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notesTitle: { fontSize: 16, fontWeight: '800' },
});
