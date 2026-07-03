import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { monthsShort } from '@/i18n/strings';
import { computeYearWrapped, latestWrappedYear } from '@/lib/stats';
import { formatDuration } from '@/lib/utils';
import { Button, EmptyState } from '@/components/ui';
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

  // Falls back to last year (January!) and is memoized so style/aspect taps
  // and the share busy-toggle don't re-aggregate the whole history per render.
  const year = useMemo(() => latestWrappedYear(books, sessions), [books, sessions]);
  const w = useMemo(
    () => (year != null ? computeYearWrapped(books, sessions, year) : null),
    [books, sessions, year]
  );
  const c = t.colors;

  if (year == null || !w) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState icon="sparkles" title={tr('wrapped.locked')} subtitle={tr('wrapped.lockedSub')} />
      </View>
    );
  }

  const months = monthsShort[lang] ?? monthsShort.en;
  const tiles = [
    { label: tr('wrapped.booksRead'), value: String(w.booksFinished) },
    { label: tr('wrapped.pagesRead'), value: w.pagesRead.toLocaleString() },
    { label: tr('wrapped.timeRead'), value: formatDuration(w.secondsRead) },
    { label: tr('wrapped.longestStreak'), value: String(w.longestStreak) },
  ];
  const highlights: { label: string; value: string }[] = [];
  if (w.topAuthor) highlights.push({ label: tr('wrapped.topAuthor'), value: w.topAuthor.name });
  if (w.busiestMonth != null) highlights.push({ label: tr('wrapped.busiestMonth'), value: months[w.busiestMonth] });
  if (w.longestBook) highlights.push({ label: tr('wrapped.longestBook'), value: w.longestBook.title });
  if (w.avgRating != null) highlights.push({ label: tr('wrapped.avgRating'), value: `${w.avgRating.toFixed(1)} ★` });

  const shareCard = async () => {
    if (busy) return;
    setBusy(true);
    const res = await shareViewAsImage(cardRef);
    setBusy(false);
    if (res === 'failed') Alert.alert(tr('share.failedTitle'), tr('share.failedMsg'));
    else if (res === 'unavailable') Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, alignItems: 'center' }}>
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
          heading: tr('wrapped.title', { year }),
          tiles,
          highlights: highlights.slice(0, 4),
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
