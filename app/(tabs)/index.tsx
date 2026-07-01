import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '@/store/useStore';
import { useSnackbar } from '@/store/useSnackbar';
import { Book, MOOD_OPTIONS, ReadingPace, ReadingStatus, STATUS_ORDER } from '@/types';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookRow } from '@/components/BookRow';
import { BookCover } from '@/components/BookCover';
import { Button, EmptyState, Pill, ProgressBar } from '@/components/ui';
import { BottomSheet } from '@/components/BottomSheet';
import { deleteCoverFile } from '@/lib/covers';

type Filter = { kind: 'all' } | { kind: 'status'; status: ReadingStatus } | { kind: 'shelf'; id: string };
type Sort = 'recent' | 'title' | 'author' | 'rating' | 'progress';
const SORTS: Sort[] = ['recent', 'title', 'author', 'rating', 'progress'];
const PACES: ReadingPace[] = ['slow', 'medium', 'fast'];

function progressOf(b: Book): number {
  if (b.status === 'finished') return 1;
  return b.pageCount && b.pageCount > 0 ? Math.min(1, b.currentPage / b.pageCount) : 0;
}

export default function LibraryScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const books = useStore((s) => s.books);
  const shelves = useStore((s) => s.shelves);
  const deleteBooks = useStore((s) => s.deleteBooks);
  const restoreBooks = useStore((s) => s.restoreBooks);
  const showSnackbar = useSnackbar((s) => s.show);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moodFilter, setMoodFilter] = useState<Set<string>>(new Set());
  const [paceFilter, setPaceFilter] = useState<Set<ReadingPace>>(new Set());
  const activeFilters = moodFilter.size + paceFilter.size;
  const toggleMood = (m: string) =>
    setMoodFilter((p) => {
      const n = new Set(p);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });
  const togglePace = (p: ReadingPace) =>
    setPaceFilter((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  const clearFilters = () => {
    setMoodFilter(new Set());
    setPaceFilter(new Set());
  };
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // Stable row handlers so memoized BookRows don't all re-render while typing in
  // the search box (their identity only changes when selection mode flips).
  const handleRowPress = useCallback(
    (id: string) => {
      if (selectMode) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
      } else {
        router.push(`/book/${id}`);
      }
    },
    [selectMode]
  );
  const handleRowLongPress = useCallback(
    (id: string) => {
      if (!selectMode) {
        setSelectMode(true);
        setSelected(new Set([id]));
      }
    },
    [selectMode]
  );

  // Leave selection mode automatically once nothing is selected.
  useEffect(() => {
    if (selectMode && selected.size === 0) setSelectMode(false);
  }, [selectMode, selected]);

  const onBulkDelete = () => {
    const ids = [...selected];
    if (!ids.length) return;
    const removed = deleteBooks(ids);
    exitSelect();
    showSnackbar(
      ids.length === 1 ? tr('book.deletedOne') : tr('book.deletedMany', { n: ids.length }),
      {
        actionLabel: tr('common.undo'),
        onAction: () => restoreBooks(removed),
        onDismiss: () => removed.books.forEach((b) => void deleteCoverFile(b.coverUrl)),
      }
    );
  };

  const reading = useMemo(
    () => books.filter((b) => b.status === 'reading'),
    [books]
  );

  // Precompute a lowercased search haystack per book once (per library / language
  // change) instead of rebuilding it for every book on every keystroke.
  const haystacks = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of books) {
      m.set(
        b.id,
        [
          b.title,
          ...b.authors,
          b.series ?? '',
          ...(b.categories ?? []),
          ...(b.moods ?? []).map((mo) => tr(`mood.${mo}`)),
          b.pace ? tr(`pace.${b.pace}`) : '',
        ]
          .join(' ')
          .toLowerCase()
      );
    }
    return m;
  }, [books, tr]);

  const filtered = useMemo(() => {
    let list = books;
    if (filter.kind === 'status') list = list.filter((b) => b.status === filter.status);
    if (filter.kind === 'shelf') list = list.filter((b) => b.shelfIds.includes(filter.id));
    // mood/pace filters (match ANY selected within each group; AND across groups)
    if (moodFilter.size > 0) {
      list = list.filter((b) => (b.moods ?? []).some((m) => moodFilter.has(m)));
    }
    if (paceFilter.size > 0) {
      list = list.filter((b) => b.pace != null && paceFilter.has(b.pace));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      // free-text over the precomputed haystack (title, authors, series, genres,
      // + localised mood/pace labels so typing "cosy"/"slow" works too).
      list = list.filter((b) => (haystacks.get(b.id) ?? '').includes(q));
    }
    const sorted = [...list];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'author':
        sorted.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.addedAt - a.addedAt);
        break;
      case 'progress':
        sorted.sort((a, b) => progressOf(b) - progressOf(a) || b.addedAt - a.addedAt);
        break;
      default:
        sorted.sort((a, b) => b.addedAt - a.addedAt);
    }
    return sorted;
  }, [books, filter, query, sort, moodFilter, paceFilter, haystacks]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of books) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [books]);

  const allSelected = filtered.length > 0 && filtered.every((b) => selected.has(b.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((b) => b.id)));

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.md }}>
            <View
              style={[
                styles.searchBox,
                { backgroundColor: t.colors.card, borderColor: t.colors.border },
              ]}
            >
              <Ionicons name="search" size={18} color={t.colors.textFaint} />
              <TextInput
                placeholder={tr('library.searchPlaceholder')}
                placeholderTextColor={t.colors.textFaint}
                value={query}
                onChangeText={setQuery}
                style={[styles.searchInput, { color: t.colors.text }]}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setFiltersOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('filters.heading')}
              >
                <View>
                  <Ionicons
                    name={activeFilters > 0 ? 'funnel' : 'funnel-outline'}
                    size={18}
                    color={t.colors.primary}
                  />
                  {activeFilters > 0 ? (
                    <View style={[styles.filterDot, { backgroundColor: t.colors.accent }]} />
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                onPress={() => setSortOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('sort.heading')}
              >
                <Ionicons name="swap-vertical" size={20} color={t.colors.primary} />
              </Pressable>
            </View>

            {reading.length > 0 && filter.kind === 'all' && !query ? (
              <View>
                <Text style={[styles.sectionTitle, { color: t.colors.text }]}>
                  {tr('library.reading')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.md, paddingVertical: 4 }}
                >
                  {reading.map((b) => (
                    <ReadingCard key={b.id} book={b} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              <Pill
                label={`${tr('library.all')} · ${books.length}`}
                active={filter.kind === 'all'}
                onPress={() => setFilter({ kind: 'all' })}
              />
              {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
                <Pill
                  key={s}
                  label={`${tr(`status.${s}`)} · ${counts[s]}`}
                  active={filter.kind === 'status' && filter.status === s}
                  onPress={() => setFilter({ kind: 'status', status: s })}
                />
              ))}
              {shelves.map((sh) => (
                <Pill
                  key={sh.id}
                  label={sh.name}
                  color={sh.color}
                  icon={sh.emoji ? undefined : (sh.icon ?? 'bookmark')}
                  emoji={sh.emoji}
                  active={filter.kind === 'shelf' && filter.id === sh.id}
                  onPress={() => setFilter({ kind: 'shelf', id: sh.id })}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <BookRow
            book={item}
            selectionMode={selectMode}
            selected={selected.has(item.id)}
            onPress={handleRowPress}
            onLongPress={handleRowLongPress}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={{ gap: spacing.lg }}>
            <EmptyState
              icon="book-outline"
              title={books.length === 0 ? tr('library.emptyTitle') : tr('library.noBooksHere')}
              subtitle={books.length === 0 ? tr('library.emptySub') : tr('library.noBooksHereSub')}
            />
            {books.length === 0 ? (
              <Button label={tr('library.addFirst')} icon="add" full onPress={() => setAddOpen(true)} />
            ) : null}
          </View>
        }
      />

      {!selectMode ? (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setAddOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('add.title')}
          style={[
            styles.fab,
            { backgroundColor: t.colors.primary, bottom: insets.bottom + 16 },
          ]}
        >
          <Ionicons name="add" size={30} color={onColor(t.colors.primary)} />
        </Pressable>
      ) : null}

      {selectMode ? (
        <View
          style={[
            styles.selectBar,
            {
              backgroundColor: t.colors.card,
              borderTopColor: t.colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <Pressable onPress={exitSelect} hitSlop={8} style={styles.selectBtn}>
            <Ionicons name="close" size={22} color={t.colors.text} />
          </Pressable>
          <Text style={[styles.selectCount, { color: t.colors.text }]}>
            {tr('select.selected', { n: selected.size })}
          </Text>
          <Pressable onPress={toggleAll} hitSlop={8} style={styles.selectBtn}>
            <Ionicons
              name={allSelected ? 'checkbox' : 'checkbox-outline'}
              size={20}
              color={t.colors.primary}
            />
            <Text style={[styles.selectAllTxt, { color: t.colors.primary }]}>{tr('select.all')}</Text>
          </Pressable>
          <Pressable
            onPress={onBulkDelete}
            disabled={selected.size === 0}
            hitSlop={8}
            style={[styles.selectBtn, { opacity: selected.size === 0 ? 0.4 : 1 }]}
          >
            <Ionicons name="trash" size={20} color={t.colors.danger} />
            <Text style={[styles.selectDelete, { color: t.colors.danger }]}>{tr('common.delete')}</Text>
          </Pressable>
        </View>
      ) : null}

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />

      <BottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={tr('filters.heading')}
        right={
          activeFilters > 0 ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={[styles.readBtnTxt, { color: t.colors.primary }]}>{tr('filters.clear')}</Text>
            </Pressable>
          ) : null
        }
      >
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.filterGroupLabel, { color: t.colors.textMuted }]}>{tr('book.pace')}</Text>
          <View style={styles.filterChips}>
            {PACES.map((p) => (
              <Pill
                key={p}
                label={tr(`pace.${p}`)}
                color={t.colors.primary}
                active={paceFilter.has(p)}
                onPress={() => togglePace(p)}
              />
            ))}
          </View>

          <Text style={[styles.filterGroupLabel, { color: t.colors.textMuted }]}>{tr('book.moods')}</Text>
          <View style={styles.filterChips}>
            {MOOD_OPTIONS.map((m) => (
              <Pill
                key={m}
                label={tr(`mood.${m}`)}
                color={t.colors.accent}
                active={moodFilter.has(m)}
                onPress={() => toggleMood(m)}
              />
            ))}
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)} title={tr('sort.heading')}>
        {SORTS.map((s) => {
          const active = sort === s;
          return (
            <Pressable
              key={s}
              onPress={() => {
                setSort(s);
                setSortOpen(false);
              }}
              style={({ pressed }) => [
                styles.sheetRow,
                { backgroundColor: pressed ? t.colors.cardAlt : 'transparent' },
              ]}
            >
              <Text style={[styles.sheetLabel, { color: active ? t.colors.primary : t.colors.text }]}>
                {tr(`sort.${s}`)}
              </Text>
              {active ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

function ReadingCard({ book }: { book: Book }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const progress =
    book.pageCount && book.pageCount > 0 ? Math.min(1, book.currentPage / book.pageCount) : 0;
  return (
    <Pressable
      onPress={() => router.push(`/book/${book.id}`)}
      style={[styles.readCard, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}
    >
      <BookCover uri={book.coverUrl} title={book.title} width={104} />
      <Text numberOfLines={1} style={[styles.readTitle, { color: t.colors.text }]}>
        {book.title}
      </Text>
      <ProgressBar progress={progress} height={6} />
      <Pressable
        onPress={() => router.push(`/timer/${book.id}`)}
        style={[styles.readBtn, { backgroundColor: t.colors.primary }]}
      >
        <Ionicons name="play" size={14} color={onColor(t.colors.primary)} />
        <Text style={[styles.readBtnTxt, { color: onColor(t.colors.primary) }]}>{tr('library.read')}</Text>
      </Pressable>
    </Pressable>
  );
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const options: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; path: string }[] = [
    { icon: 'search', label: tr('add.search'), sub: tr('add.searchSub'), path: '/search' },
    { icon: 'barcode', label: tr('add.scan'), sub: tr('add.scanSub'), path: '/scan' },
    { icon: 'create', label: tr('add.manual'), sub: tr('add.manualSub'), path: '/add-manual' },
  ];
  return (
    <BottomSheet visible={open} onClose={onClose} title={tr('add.title')}>
      {options.map((o) => (
        <Pressable
          key={o.path}
          onPress={() => go(o.path)}
          style={({ pressed }) => [
            styles.sheetRow,
            { backgroundColor: pressed ? t.colors.cardAlt : 'transparent' },
          ]}
        >
          <View style={[styles.sheetIcon, { backgroundColor: t.colors.cardAlt }]}>
            <Ionicons name={o.icon} size={20} color={t.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetLabel, { color: t.colors.text }]}>{o.label}</Text>
            <Text style={[styles.sheetSub, { color: t.colors.textMuted }]}>{o.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  readCard: {
    width: 132,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  readTitle: { fontSize: 13, fontWeight: '700' },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  readBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filterDot: { position: 'absolute', top: -3, right: -4, width: 8, height: 8, borderRadius: 4 },
  filterGroupLabel: { fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectCount: { flex: 1, fontSize: 15, fontWeight: '700' },
  selectAllTxt: { fontSize: 15, fontWeight: '700' },
  selectDelete: { fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  sheetIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLabel: { fontSize: 15, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 1 },
});
