import { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { durationUnits, formatInt, useTranslation } from '@/i18n';
import { monthsShort } from '@/i18n/strings';
import { availableWrappedYears, computeYearWrapped, latestWrappedYear } from '@/lib/stats';
import { formatDuration } from '@/lib/utils';
import { finishesOf } from '@/lib/reads';
import { Button, EmptyState, Pill } from '@/components/ui';
import { ShareCard, ShareAspect, ShareStyle } from '@/components/ShareCard';
import { ShareStyleControls } from '@/components/ShareStyleControls';
import { shareViewAsImage } from '@/lib/shareImage';

const WRAPPED_STYLES: ShareStyle[] = ['minimal', 'gradient', 'paper'];
const CARD_W = 320;

export default function WrappedScreen() {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const books = useStore((s) => s.books);
  const sessions = useStore((s) => s.sessions);
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<ShareStyle>('gradient');
  const [aspect, setAspect] = useState<ShareAspect>('story');

  // Defaults to the latest year with enough activity (last year in January!)
  // and lets the user pick any earlier one. Memoized so style/aspect taps and
  // the share busy-toggle don't re-aggregate the whole history per render.
  const years = useMemo(() => availableWrappedYears(books, sessions), [books, sessions]);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const latest = useMemo(() => latestWrappedYear(books, sessions), [books, sessions]);
  const year = pickedYear != null && years.includes(pickedYear) ? pickedYear : latest;
  const w = useMemo(
    () => (year != null ? computeYearWrapped(books, sessions, year) : null),
    [books, sessions, year]
  );
  // The covers of the year's books, most recently finished first.
  const covers = useMemo(() => {
    if (year == null) return [];
    const done: { at: number; uri: string }[] = [];
    for (const b of books) {
      if (!b.coverUrl) continue;
      const last = finishesOf(b)
        .map((r) => r.finishedAt)
        .filter((at) => new Date(at).getFullYear() === year)
        .sort((a, z) => z - a)[0];
      if (last) done.push({ at: last, uri: b.coverUrl });
    }
    return done.sort((a, z) => z.at - a.at).slice(0, 6).map((d) => d.uri);
  }, [books, year]);
  const c = t.colors;

  if (year == null || !w) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState icon="sparkles" title={tr('wrapped.locked')} subtitle={tr('wrapped.lockedSub')} />
      </View>
    );
  }

  const months = monthsShort[lang] ?? monthsShort.en;
  const stats = [
    { label: tr('wrapped.pagesRead'), value: formatInt(w.pagesRead, lang) },
    { label: tr('wrapped.timeRead'), value: formatDuration(w.secondsRead, durationUnits(lang)) },
    { label: tr('wrapped.longestStreak'), value: tr('wrapped.streakValue', { n: w.longestStreak }) },
    { label: tr('wrapped.sessions'), value: formatInt(w.sessions, lang) },
  ];
  const highlights: { label: string; value: string }[] = [];
  if (w.topAuthor) highlights.push({ label: tr('wrapped.topAuthor'), value: w.topAuthor.name });
  if (w.busiestMonth != null) highlights.push({ label: tr('wrapped.busiestMonth'), value: months[w.busiestMonth] });
  if (w.longestBook) highlights.push({ label: tr('wrapped.longestBook'), value: w.longestBook.title });
  if (w.avgRating != null) highlights.push({ label: tr('wrapped.avgRating'), value: `${w.avgRating.toFixed(1)} ★` });

  const shareCard = async () => {
    if (busy) return;
    setBusy(true);
    const res = await shareViewAsImage(cardRef, { preloadUrls: covers });
    setBusy(false);
    if (res === 'failed') Alert.alert(tr('share.failedTitle'), tr('share.failedMsg'));
    else if (res === 'unavailable') Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, alignItems: 'center' }}>
      {years.length > 1 ? (
        <View style={{ width: '100%', maxWidth: 480, gap: spacing.sm }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>{tr('wrapped.pickYear')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {years.map((y) => (
              <Pill key={y} label={String(y)} active={y === year} onPress={() => setPickedYear(y)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ShareStyleControls
        styles={WRAPPED_STYLES}
        style={style}
        aspect={aspect}
        primary={c.primary}
        accent={c.accent}
        onStyle={setStyle}
        onAspect={setAspect}
      />
      <ShareCard
        ref={cardRef}
        theme={t}
        style={style}
        aspect={aspect}
        width={CARD_W}
        content={{
          kind: 'wrapped',
          kicker: tr('share.kicker.year'),
          year: String(year),
          hero: { value: formatInt(w.booksFinished, lang), label: tr('wrapped.booksRead') },
          stats,
          highlights: highlights.slice(0, 4),
          covers,
        }}
      />
      <View style={{ width: '100%', maxWidth: 480 }}>
        <Button
          label={busy ? tr('share.preparing') : tr('wrapped.share')}
          icon="share-social"
          full
          loading={busy}
          onPress={shareCard}
        />
      </View>
    </ScrollView>
  );
}
