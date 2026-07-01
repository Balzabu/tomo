import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { searchBooks } from '@/services/bookApi';
import { BookSearchResult, ReadingStatus, STATUS_ORDER } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookCover } from '@/components/BookCover';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store/useStore';

export default function SearchScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [picker, setPicker] = useState<BookSearchResult | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const myId = ++reqId.current;
      setLoading(true);
      const r = await searchBooks(query);
      // Ignore a stale response (newer search) or one that resolved after the
      // screen was dismissed.
      if (myId !== reqId.current || !mountedRef.current) return;
      setResults(r);
      setSearched(true);
      setLoading(false);
    }, 450);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            autoFocus
            placeholder={tr('search.placeholder')}
            placeholderTextColor={t.colors.textFaint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            style={[styles.searchInput, { color: t.colors.text }]}
          />
          {loading ? <ActivityIndicator color={t.colors.primary} /> : null}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item, i) => item.isbn ?? `${item.title}-${item.authors[0] ?? ''}-${i}`}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setPicker(item);
            }}
            style={[styles.row, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}
          >
            <BookCover uri={item.coverUrl} title={item.title} width={44} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={[styles.title, { color: t.colors.text }]}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={[styles.author, { color: t.colors.textMuted }]}>
                {item.authors.join(', ') || tr('common.unknownAuthor')}
              </Text>
              {item.pageCount ? (
                <Text style={[styles.meta, { color: t.colors.textFaint }]}>
                  {tr('search.pages', { count: item.pageCount })}
                </Text>
              ) : null}
            </View>
            <Ionicons name="add-circle" size={26} color={t.colors.primary} />
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : searched ? (
            <EmptyState icon="sad-outline" title={tr('search.noResults')} subtitle={tr('search.noResultsSub')} />
          ) : (
            <EmptyState
              icon="search"
              title={tr('search.emptyTitle')}
              subtitle={tr('search.emptySub')}
            />
          )
        }
      />

      <StatusPicker
        item={picker}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function StatusPicker({
  item,
  onClose,
}: {
  item: BookSearchResult | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const addBook = useStore((s) => s.addBook);
  if (!item) return null;

  const choose = (status: ReadingStatus) => {
    addBook(item, status);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    router.back();
  };

  return (
    <View style={styles.pickerWrap} pointerEvents="box-none">
      <Pressable style={[styles.pickerBackdrop, { backgroundColor: t.colors.overlay }]} onPress={onClose} />
      <View style={[styles.picker, { backgroundColor: t.colors.card }]}>
        <Text numberOfLines={1} style={[styles.pickerTitle, { color: t.colors.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.pickerSub, { color: t.colors.textMuted }]}>
          {tr('search.saveWhere')}
        </Text>
        {STATUS_ORDER.map((s) => (
          <Pressable
            key={s}
            onPress={() => choose(s)}
            style={({ pressed }) => [
              styles.pickerRow,
              { backgroundColor: pressed ? t.colors.cardAlt : 'transparent' },
            ]}
          >
            <Text style={[styles.pickerLabel, { color: t.colors.text }]}>
              {tr(`status.${s}`)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 15, fontWeight: '700' },
  author: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 2 },
  pickerWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject },
  picker: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 2,
  },
  pickerTitle: { fontSize: 17, fontWeight: '800' },
  pickerSub: { fontSize: 13, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  pickerLabel: { fontSize: 15, fontWeight: '600' },
});
