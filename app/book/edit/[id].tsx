import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useBook, useStore } from '@/store/useStore';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { CoverPicker } from '@/components/CoverPicker';
import { BookExtraFields } from '@/components/BookExtraFields';
import { deleteCoverFile } from '@/lib/covers';
import { ReadingPace } from '@/types';

export default function EditBookScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useBook(id);
  const updateBook = useStore((s) => s.updateBook);

  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState((book?.authors ?? []).join(', '));
  const [pages, setPages] = useState(book?.pageCount ? String(book.pageCount) : '');
  const [coverUrl, setCoverUrl] = useState<string | undefined>(book?.coverUrl);
  const [series, setSeries] = useState(book?.series ?? '');
  const [seriesNumber, setSeriesNumber] = useState(
    book?.seriesNumber != null ? String(book.seriesNumber) : ''
  );
  const [pace, setPace] = useState<ReadingPace | undefined>(book?.pace);
  const [moods, setMoods] = useState<string[]>(book?.moods ?? []);
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

  const save = () => {
    if (savedRef.current || !title.trim()) return;
    savedRef.current = true;
    const pc = parseInt(pages, 10);
    const sn = parseFloat(seriesNumber);
    updateBook(book.id, {
      title: title.trim(),
      authors: author.trim() ? author.split(',').map((a) => a.trim()).filter(Boolean) : [],
      pageCount: Number.isFinite(pc) && pc > 0 ? pc : undefined,
      coverUrl,
      series: series.trim() || undefined,
      seriesNumber: Number.isFinite(sn) ? sn : undefined,
      pace,
      moods: moods.length ? moods : undefined,
    });
    // The cover was replaced/removed → delete the now-unreferenced local file.
    if (coverUrl !== book.coverUrl) void deleteCoverFile(book.coverUrl);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
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

        <Button label={tr('common.save')} icon="checkmark" full onPress={save} disabled={!title.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
});
