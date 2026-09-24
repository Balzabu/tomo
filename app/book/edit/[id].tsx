import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBook, useStore } from '@/store/useStore';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { CoverPicker } from '@/components/CoverPicker';
import { BookExtraFields } from '@/components/BookExtraFields';
import { IsbnField } from '@/components/IsbnField';
import { CatalogRefreshSheet } from '@/components/CatalogRefreshSheet';
import { deleteCoverFile } from '@/lib/covers';
import { compactIsbn, looksLikeIsbn, normalizeIsbn } from '@/lib/isbn';
import { checkedIsbnAfterLookup, pickValues, RefreshValues } from '@/lib/bookRefresh';
import { parseLocalDateKey, toDateKey } from '@/lib/utils';
import { ReadingPace, ReadRecord } from '@/types';

/** Reading dates are edited as YYYY-MM-DD text: the app has no date-picker
 *  dependency, and day-stepping chevrons (SessionEditor) are unusable for a
 *  book read two years ago. '' means "no date". */
interface DateDraft {
  startedOn: string;
  finishedOn: string;
  /** original timestamps, so an unchanged day keeps its time-of-day (and a
   *  removed row can't shift the others' originals) */
  origStartedAt?: number;
  origFinishedAt?: number;
}

function dateKeyOf(ts?: number): string {
  return ts != null ? toDateKey(ts) : '';
}

function draftOfBook(startedAt?: number, finishedAt?: number): DateDraft {
  return {
    startedOn: dateKeyOf(startedAt),
    finishedOn: dateKeyOf(finishedAt),
    origStartedAt: startedAt,
    origFinishedAt: finishedAt,
  };
}

/** null = invalid text; undefined = empty (no date). */
function parseDraftDate(s: string): number | null | undefined {
  if (s.trim() === '') return undefined;
  return parseLocalDateKey(s);
}

/** Validate one start/finish pair; returns an error key or null. */
function draftError(d: DateDraft): 'editBook.dateInvalid' | 'editBook.dateOrder' | null {
  const s = parseDraftDate(d.startedOn);
  const f = parseDraftDate(d.finishedOn);
  if (s === null || f === null) return 'editBook.dateInvalid';
  if (s != null && f != null && f < s) return 'editBook.dateOrder';
  return null;
}

export default function EditBookScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  // refresh=1: opened from the book page's "details missing" banner - start
  // straight on the catalogue lookup.
  const { id, refresh } = useLocalSearchParams<{ id: string; refresh?: string }>();
  const book = useBook(id);
  const updateBook = useStore((s) => s.updateBook);

  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState((book?.authors ?? []).join(', '));
  const [pages, setPages] = useState(book?.pageCount ? String(book.pageCount) : '');
  const [coverUrl, setCoverUrl] = useState<string | undefined>(book?.coverUrl);
  const [isbn, setIsbn] = useState(book?.isbn ?? '');
  const isbnLookup = normalizeIsbn(isbn) ?? compactIsbn(isbn);
  const canRefresh = looksLikeIsbn(isbnLookup);
  const [refreshOpen, setRefreshOpen] = useState(refresh === '1' && canRefresh);
  // Catalogue values for fields this form has no input for (publisher,
  // description...); written together with the rest on Save.
  const [catalogExtra, setCatalogExtra] = useState<RefreshValues>({});
  const [catalogApplied, setCatalogApplied] = useState(false);
  const [series, setSeries] = useState(book?.series ?? '');
  const [seriesNumber, setSeriesNumber] = useState(
    book?.seriesNumber != null ? String(book.seriesNumber) : ''
  );
  const [pace, setPace] = useState<ReadingPace | undefined>(book?.pace);
  const [moods, setMoods] = useState<string[]>(book?.moods ?? []);
  const [dates, setDates] = useState<DateDraft>(draftOfBook(book?.startedAt, book?.finishedAt));
  const [pastReads, setPastReads] = useState<DateDraft[]>(
    (book?.reads ?? []).map((r) => draftOfBook(r.startedAt, r.finishedAt))
  );
  const setReadDates = useStore((s) => s.setReadDates);
  // One-shot guard: a second quick tap on Save would fire router.back() twice
  // and pop the book-detail screen under this modal too.
  const savedRef = useRef(false);

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
        <Text style={{ color: t.colors.text }}>{tr('book.notFound')}</Text>
      </View>
    );
  }

  // Dates are validated live; Save stays disabled while any of them is wrong.
  const currentError = draftError(dates);
  const pastErrors = pastReads.map(draftError);
  const datesValid = !currentError && pastErrors.every((e) => !e);
  const showFinished = book.status === 'finished' || book.finishedAt != null;

  const save = () => {
    if (savedRef.current || !title.trim() || !datesValid) return;
    savedRef.current = true;
    const pc = parseInt(pages, 10);
    const sn = parseFloat(seriesNumber);
    // An empty field clears the page count on purpose; garbled input ("abc")
    // keeps the existing value instead of silently erasing it.
    const pageCount = pages.trim() === '' ? undefined : Number.isFinite(pc) && pc > 0 ? pc : book.pageCount;
    updateBook(book.id, {
      ...catalogExtra,
      isbn: isbn.trim() || undefined,
      title: title.trim(),
      authors: author.trim() ? author.split(',').map((a) => a.trim()).filter(Boolean) : [],
      pageCount,
      coverUrl,
      series: series.trim() || undefined,
      seriesNumber: Number.isFinite(sn) && sn >= 0 ? sn : undefined,
      pace,
      moods: moods.length ? moods : undefined,
    });
    // Reading dates: only write when something actually changed, and keep the
    // original time-of-day when the day is unchanged.
    const keep = (orig: number | undefined, text: string): number | null =>
      dateKeyOf(orig) === text ? (orig ?? null) : (parseDraftDate(text) ?? null);
    const nextStarted = keep(book.startedAt, dates.startedOn);
    const nextFinished = showFinished ? keep(book.finishedAt, dates.finishedOn) : (book.finishedAt ?? null);
    const nextReads: ReadRecord[] = [];
    for (const d of pastReads) {
      const finishedAt = keep(d.origFinishedAt, d.finishedOn);
      if (finishedAt == null) continue; // a past read without a finish is dropped
      const startedAt = keep(d.origStartedAt, d.startedOn);
      nextReads.push(startedAt != null ? { startedAt, finishedAt } : { finishedAt });
    }
    const readsChanged = JSON.stringify(nextReads) !== JSON.stringify(book.reads ?? []);
    if (
      nextStarted !== (book.startedAt ?? null) ||
      nextFinished !== (book.finishedAt ?? null) ||
      readsChanged
    ) {
      setReadDates(book.id, { startedAt: nextStarted, finishedAt: nextFinished, reads: nextReads });
    }
    // The cover was replaced/removed → delete the now-unreferenced local file.
    if (coverUrl !== book.coverUrl) void deleteCoverFile(book.coverUrl);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const authorList = (text: string) =>
    text.trim() ? text.split(',').map((a) => a.trim()).filter(Boolean) : [];

  // What the catalogue diff is made against: the form as it is now, plus the
  // stored fields the form doesn't show.
  const draftValues: RefreshValues = {
    ...pickValues(book),
    ...catalogExtra,
    title: title.trim(),
    authors: authorList(author),
    pageCount: parseInt(pages, 10) > 0 ? parseInt(pages, 10) : undefined,
    coverUrl,
  };

  // The lookup was for the saved ISBN and can't complete the saved book:
  // record it so the book page stops offering it (the form is untouched).
  const onCatalogResult = (values: RefreshValues | null) => {
    if (isbnLookup !== (normalizeIsbn(book.isbn) ?? compactIsbn(book.isbn ?? ''))) return;
    const checked = checkedIsbnAfterLookup(book, values);
    if (checked) updateBook(book.id, { catalogCheckedIsbn: checked });
  };

  const applyCatalog = (patch: RefreshValues) => {
    const { title: pt, authors: pa, pageCount: pp, coverUrl: pc, ...extra } = patch;
    if (pt !== undefined) setTitle(pt);
    if (pa !== undefined) setAuthor(pa.join(', '));
    if (pp !== undefined) setPages(String(pp));
    if (pc !== undefined) setCoverUrl(pc);
    setCatalogExtra((prev) => ({ ...prev, ...extra }));
    if (Object.keys(patch).length > 0) setCatalogApplied(true);
  };

  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    opts?: { keyboard?: 'numeric'; placeholder?: string }
  ) => (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setter}
        placeholder={opts?.placeholder}
        placeholderTextColor={t.colors.textFaint}
        keyboardType={opts?.keyboard ?? 'default'}
        style={[
          styles.input,
          { backgroundColor: t.colors.card, borderColor: t.colors.border, color: t.colors.text },
        ]}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('cover.label')}</Text>
          <CoverPicker coverUrl={coverUrl} title={title} onChange={setCoverUrl} />
        </View>

        {field(tr('manual.bookTitle'), title, setTitle, { placeholder: tr('manual.titlePlaceholder') })}
        {field(tr('manual.authors'), author, setAuthor, { placeholder: tr('manual.authorsPlaceholder') })}
        {field(tr('manual.pages'), pages, setPages, { keyboard: 'numeric', placeholder: tr('manual.pagesPlaceholder') })}

        <View style={{ gap: spacing.sm }}>
          <IsbnField value={isbn} onChange={setIsbn} />
          <Button
            label={tr('refresh.button')}
            icon="cloud-download-outline"
            variant="secondary"
            full
            disabled={!canRefresh}
            onPress={() => setRefreshOpen(true)}
          />
          {!canRefresh ? (
            <Text style={[styles.hint, { color: t.colors.textFaint }]}>{tr('refresh.needIsbn')}</Text>
          ) : catalogApplied ? (
            <Text style={[styles.hint, { color: t.colors.primary }]}>{tr('refresh.applied')}</Text>
          ) : null}
        </View>

        <BookExtraFields
          series={series}
          seriesNumber={seriesNumber}
          pace={pace}
          moods={moods}
          onSeries={setSeries}
          onSeriesNumber={setSeriesNumber}
          onPace={setPace}
          onMoods={setMoods}
        />

        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text style={[styles.sectionTitle, { color: t.colors.text }]}>{tr('editBook.dates')}</Text>
            <Text style={[styles.hint, { color: t.colors.textFaint }]}>{tr('editBook.datesHint')}</Text>
          </View>
          <DateField
            label={tr('editBook.startedOn')}
            value={dates.startedOn}
            onChange={(v) => setDates((d) => ({ ...d, startedOn: v }))}
            invalid={currentError === 'editBook.dateInvalid' && parseDraftDate(dates.startedOn) === null}
          />
          {showFinished ? (
            <DateField
              label={tr('editBook.finishedOn')}
              value={dates.finishedOn}
              onChange={(v) => setDates((d) => ({ ...d, finishedOn: v }))}
              invalid={currentError === 'editBook.dateInvalid' && parseDraftDate(dates.finishedOn) === null}
            />
          ) : null}
          {currentError ? (
            <Text style={[styles.error, { color: t.colors.danger }]}>{tr(currentError)}</Text>
          ) : null}

          {pastReads.length > 0 ? (
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('editBook.pastReads')}</Text>
              {pastReads.map((d, i) => (
                <View key={i} style={[styles.pastRead, { borderColor: t.colors.border }]}>
                  <View style={styles.pastReadHead}>
                    <Text style={[styles.label, { color: t.colors.textMuted }]}>
                      {tr('editBook.pastRead', { n: i + 1 })}
                    </Text>
                    <Pressable
                      onPress={() => setPastReads((list) => list.filter((_, j) => j !== i))}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={tr('common.delete')}
                    >
                      <Ionicons name="close-circle" size={20} color={t.colors.textFaint} />
                    </Pressable>
                  </View>
                  <DateField
                    label={tr('editBook.startedOn')}
                    value={d.startedOn}
                    onChange={(v) =>
                      setPastReads((list) => list.map((x, j) => (j === i ? { ...x, startedOn: v } : x)))
                    }
                    invalid={parseDraftDate(d.startedOn) === null}
                  />
                  <DateField
                    label={tr('editBook.finishedOn')}
                    value={d.finishedOn}
                    onChange={(v) =>
                      setPastReads((list) => list.map((x, j) => (j === i ? { ...x, finishedOn: v } : x)))
                    }
                    invalid={parseDraftDate(d.finishedOn) === null}
                  />
                  {pastErrors[i] ? (
                    <Text style={[styles.error, { color: t.colors.danger }]}>{tr(pastErrors[i]!)}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Button
          label={tr('common.save')}
          icon="checkmark"
          full
          onPress={save}
          disabled={!title.trim() || !datesValid}
        />
      </ScrollView>
      <CatalogRefreshSheet
        visible={refreshOpen}
        isbn={isbnLookup}
        current={draftValues}
        title={title}
        onApply={applyCatalog}
        onResult={onCatalogResult}
        onClose={() => setRefreshOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function DateField({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.colors.textMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={t.colors.textFaint}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          style={[
            styles.input,
            {
              flex: 1,
              backgroundColor: t.colors.card,
              borderColor: invalid ? t.colors.danger : t.colors.border,
              borderWidth: invalid ? 1 : StyleSheet.hairlineWidth,
              color: t.colors.text,
            },
          ]}
        />
        <Pressable
          onPress={() => onChange(toDateKey())}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tr('session.today')}
          style={[styles.iconBtn, { backgroundColor: t.colors.cardAlt }]}
        >
          <Ionicons name="today-outline" size={20} color={t.colors.primary} />
        </Pressable>
        {value ? (
          <Pressable
            onPress={() => onChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('common.clear')}
            style={[styles.iconBtn, { backgroundColor: t.colors.cardAlt }]}
          >
            <Ionicons name="close" size={20} color={t.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 12, fontWeight: '600' },
  iconBtn: { width: 44, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pastRead: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  pastReadHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
});
