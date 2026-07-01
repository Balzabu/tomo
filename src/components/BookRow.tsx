import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Book } from '@/types';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookCover } from './BookCover';
import { ProgressBar } from './ui';
import { RatingStars } from './RatingStars';

// Memoized so an unrelated parent re-render (e.g. typing in the library search)
// doesn't re-render every visible row. Callbacks take the book id so the parent
// can keep them stable (see the library screen).
export const BookRow = memo(function BookRow({
  book,
  onPress,
  onLongPress,
  selectionMode,
  selected,
}: {
  book: Book;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const progress =
    book.pageCount && book.pageCount > 0
      ? Math.min(1, book.currentPage / book.pageCount)
      : book.status === 'finished'
      ? 1
      : 0;

  return (
    <Pressable
      onPress={() => (onPress ? onPress(book.id) : router.push(`/book/${book.id}`))}
      onLongPress={onLongPress ? () => onLongPress(book.id) : undefined}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.card,
          borderColor: selected ? t.colors.primary : t.colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <BookCover uri={book.coverUrl} title={book.title} width={48} />
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: t.colors.text }]}>
          {book.title}
        </Text>
        <Text numberOfLines={1} style={[styles.author, { color: t.colors.textMuted }]}>
          {book.authors.join(', ') || tr('common.unknownAuthor')}
        </Text>

        {book.status === 'reading' && book.pageCount ? (
          <View style={{ marginTop: 6, gap: 4 }}>
            <ProgressBar progress={progress} />
            <Text style={[styles.meta, { color: t.colors.textFaint }]}>
              {tr('common.pageAbbr')} {book.currentPage} / {book.pageCount} · {Math.round(progress * 100)}%
            </Text>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: t.colors.textFaint }]}>
              {tr(`status.${book.status}`)}
            </Text>
            {book.rating ? <RatingStars value={book.rating} size={13} /> : null}
          </View>
        )}
      </View>
      {selectionMode ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? t.colors.primary : t.colors.textFaint}
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  author: { fontSize: 13, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  meta: { fontSize: 12 },
});
