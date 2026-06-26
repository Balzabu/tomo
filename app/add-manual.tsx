import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ReadingPace, ReadingStatus, STATUS_ORDER } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, Pill } from '@/components/ui';
import { CoverPicker } from '@/components/CoverPicker';
import { BookExtraFields } from '@/components/BookExtraFields';
import { useStore } from '@/store/useStore';

export default function AddManualScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const addManualBook = useStore((s) => s.addManualBook);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
  const [series, setSeries] = useState('');
  const [seriesNumber, setSeriesNumber] = useState('');
  const [pace, setPace] = useState<ReadingPace | undefined>(undefined);
  const [moods, setMoods] = useState<string[]>([]);

  const save = () => {
    if (!title.trim()) return;
    const pc = parseInt(pages, 10);
    const sn = parseFloat(seriesNumber);
    addManualBook({
      title: title.trim(),
      authors: author.trim() ? author.split(',').map((a) => a.trim()).filter(Boolean) : [],
      pageCount: Number.isFinite(pc) && pc > 0 ? pc : undefined,
      status,
      coverUrl,
      series: series.trim() || undefined,
      seriesNumber: Number.isFinite(sn) ? sn : undefined,
      pace,
      moods: moods.length ? moods : undefined,
    });
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

        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('manual.status')}</Text>
          <View style={styles.pills}>
            {STATUS_ORDER.map((s) => (
              <Pill
                key={s}
                label={tr(`status.${s}`)}
                active={status === s}
                onPress={() => setStatus(s)}
              />
            ))}
          </View>
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

        <Button label={tr('manual.save')} icon="checkmark" full onPress={save} disabled={!title.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
