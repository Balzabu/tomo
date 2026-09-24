import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { findPageCount, isbnFromQuery, lookupByIsbn, searchBooks } from '@/services/bookApi';
import { BookSearchResult, ReadingStatus, STATUS_ORDER } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookCover } from '@/components/BookCover';
import { Button, EmptyState } from '@/components/ui';
import { SlowHint } from '@/components/SlowHint';
import { findExistingBook, useStore } from '@/store/useStore';
import { useSnackbar } from '@/store/useSnackbar';

export default function SearchScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [offline, setOffline] = useState(false);
  const [picker, setPicker] = useState<BookSearchResult | null>(null);
  // Bumped by "Try again" after a failed (offline) search: re-runs the same query.
  const [attempt, setAttempt] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const mountedRef = useRef(true);
  // The in-flight request, cancelled when a newer query starts or the screen
  // is dismissed - otherwise a slow 3-source chain keeps running for nothing.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 3) {
      // Also invalidate any in-flight search, or its late response would
      // repopulate the list for a query the user already erased.
      reqId.current++;
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setSearched(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const myId = ++reqId.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const isbn = isbnFromQuery(query);
      const r = isbn
        ? await lookupByIsbn(isbn, { signal: controller.signal }).then(({ result, offline }) => ({
            results: result ? [result] : [],
            offline,
          }))
        : await searchBooks(query, { signal: controller.signal });
      // Ignore a stale response (newer search) or one that resolved after the
      // screen was dismissed.
      if (myId !== reqId.current || !mountedRef.current) return;
      setResults(r.results);
      setOffline(r.offline);
      setSearched(true);
      setLoading(false);
    }, 450);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, attempt]);

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
        <SlowHint active={loading} style={[styles.slow, { color: t.colors.textMuted }]} />
      </View>

      <FlatList
        data={results}
        // The index is always part of the key: sources can return two entries
        // with the same ISBN but different titles (subtitle variants), and
        // duplicate keys make FlatList recycle the wrong rows.
        keyExtractor={(item, i) =>
          item.isbn ? `${item.isbn}-${i}` : `${item.title}-${item.authors[0] ?? ''}-${i}`
        }
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
              {item.isbn ? (
                <Text style={[styles.meta, { color: t.colors.textFaint }]}>ISBN {item.isbn}</Text>
              ) : null}
            </View>
            <Ionicons name="add-circle" size={26} color={t.colors.primary} />
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : searched && offline ? (
            // Airplane mode / no network is not "this book doesn't exist".
            <View style={{ gap: spacing.md }}>
              <EmptyState icon="cloud-offline-outline" title={tr('search.offline')} subtitle={tr('search.offlineSub')} />
              <Button label={tr('error.retry')} icon="refresh" onPress={() => setAttempt((n) => n + 1)} style={{ alignSelf: 'center' }} />
            </View>
          ) : searched ? (
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
  const addBookToStore = useStore((s) => s.addBook);
  // Title searches skip the per-ISBN page-count fallbacks (too slow for a
  // whole result list), so a book added without its length gets it filled in
  // the background - unless the user has typed one in by then.
  const addBook = (result: BookSearchResult, status: ReadingStatus) => {
    const book = addBookToStore(result, status);
    if (book.pageCount || !book.isbn) return;
    void findPageCount(book.isbn).then((pageCount) => {
      if (!pageCount) return;
      useStore.getState().updateBooks([{ id: book.id, patch: { pageCount } }], (cur) => !cur.pageCount);
    });
  };
  // One-shot guard: two quick taps on a status row would add the book twice
  // (and pop two screens). Re-armed whenever a new result is picked.
  const chosenRef = useRef(false);
  useEffect(() => {
    chosenRef.current = false;
  }, [item]);

  // Android hardware back while the sheet is open should close the sheet, not
  // pop the whole search screen (this is a plain overlay, not a Modal, so the
  // OS knows nothing about it).
  useEffect(() => {
    if (!item) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [item, onClose]);

  if (!item) return null;

  const choose = (status: ReadingStatus) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    // Already in the library (scanned or added before, possibly as another
    // edition): warn instead of silently duplicating, but keep "add anyway"
    // one tap away.
    const existing = findExistingBook(useStore.getState().books, item);
    if (existing) {
      onClose();
      useSnackbar.getState().show(tr('search.inLibrary', { title: item.title }), {
        actionLabel: tr('search.addAnyway'),
        onAction: () => {
          addBook(item, status);
        },
      });
      return;
    }
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
  slow: { fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
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
