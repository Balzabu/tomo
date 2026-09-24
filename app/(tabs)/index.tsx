import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TextInput } from '@/components/ThemedTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '@/store/useStore';
import { useSettings } from '@/store/useSettings';
import { useSnackbar } from '@/store/useSnackbar';
import {
  Book,
  LIBRARY_SORTS,
  LibraryFilter,
  LibrarySort,
  MOOD_OPTIONS,
  ReadingPace,
  ReadingStatus,
  STATUS_ORDER,
} from '@/types';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookRow } from '@/components/BookRow';
import { BookCover } from '@/components/BookCover';
import { Button, EmptyState, Pill, ProgressBar } from '@/components/ui';
import { BottomSheet } from '@/components/BottomSheet';

type Filter = LibraryFilter;
type Sort = LibrarySort;
const SORTS: Sort[] = LIBRARY_SORTS;
const PACES: ReadingPace[] = ['slow', 'medium', 'fast'];
/** Sorts whose natural order is "newest / highest first". */
const DESC_BY_DEFAULT: Sort[] = ['recent', 'rating', 'progress', 'finished', 'started'];
/** The library's starting order (as in useSettings), which "Reset" returns to. */
const DEFAULT_SORT: Sort = 'recent';

/** Last finish of a book (current cycle or history), for the "date finished" sort. */
function lastFinishedAt(b: Book): number {
  const past = b.reads?.length ? b.reads[b.reads.length - 1].finishedAt : 0;
  return Math.max(b.finishedAt ?? 0, past);
}

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
  // Sort, direction and filter survive restarts (persisted in settings).
  const filter = useSettings((s) => s.libraryFilter);
  const sort = useSettings((s) => s.librarySort);
  const sortAsc = useSettings((s) => s.librarySortAsc);
  const setLibraryView = useSettings((s) => s.setLibraryView);
  const setFilter = useCallback((f: Filter) => setLibraryView({ libraryFilter: f }), [setLibraryView]);

  // Deep links (e.g. the "+N more" of the Start-session widget) can open the
  // library pre-filtered: tomo:///?status=reading. Consume the param so a later
  // manual filter change isn't overridden when the screen re-renders.
  const { status: linkStatus } = useLocalSearchParams<{ status?: string }>();
  useEffect(() => {
    if (linkStatus && STATUS_ORDER.includes(linkStatus as ReadingStatus)) {
      setFilter({ kind: 'status', status: linkStatus as ReadingStatus });
      router.setParams({ status: undefined });
    }
  }, [linkStatus, setFilter]);
  const setSort = useCallback(
    (next: Sort) => {
      // Picking a sort resets the direction to that sort's natural one; tapping
      // the active sort again flips it.
      const flip = next === sort;
      setLibraryView({
        librarySort: next,
        librarySortAsc: flip ? !sortAsc : !DESC_BY_DEFAULT.includes(next),
      });
    },
    [setLibraryView, sort, sortAsc]
  );
  // There is always an order, so a sort can't be "deselected": like the
  // filters, a changed order is flagged on its button and can be reset.
  const sortChanged = sort !== DEFAULT_SORT || sortAsc !== !DESC_BY_DEFAULT.includes(DEFAULT_SORT);
  const resetSort = () => {
    setLibraryView({ librarySort: DEFAULT_SORT, librarySortAsc: !DESC_BY_DEFAULT.includes(DEFAULT_SORT) });
    setSortOpen(false);
  };
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

  // The active shelf filter can outlive its shelf (deleted in Settings or by
  // clear-all): fall back to "all" instead of an empty list with no chip lit.
  useEffect(() => {
    if (filter.kind === 'shelf' && !shelves.some((sh) => sh.id === filter.id)) {
      setFilter({ kind: 'all' });
    }
  }, [filter, shelves]);

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
        // Cover files are NOT deleted here: the delete may still be un-persisted
        // (or undone), and launch-time reconcileCovers already reclaims files no
        // longer referenced by the *saved* data - the only source of truth.
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
    // Each comparator is written in its "natural" direction (see
    // DESC_BY_DEFAULT); the user's direction choice flips it afterwards.
    // Books without the sorted-by date always sink to the bottom.
    const missingLast = (a: number, b: number, desc: boolean) =>
      a === 0 && b !== 0 ? 1 : b === 0 && a !== 0 ? -1 : desc ? b - a : a - b;
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
      case 'finished':
        sorted.sort((a, b) => missingLast(lastFinishedAt(a), lastFinishedAt(b), true) || b.addedAt - a.addedAt);
        break;
      case 'started':
        sorted.sort((a, b) => missingLast(a.startedAt ?? 0, b.startedAt ?? 0, true) || b.addedAt - a.addedAt);
        break;
      default:
        sorted.sort((a, b) => b.addedAt - a.addedAt);
    }
    const natural = !DESC_BY_DEFAULT.includes(sort); // true = ascending is natural
    if (sortAsc !== natural) {
      if (sort === 'finished' || sort === 'started') {
        // Keep "no date" at the bottom in both directions.
        const has = (b: Book) => (sort === 'finished' ? lastFinishedAt(b) : b.startedAt ?? 0) !== 0;
        const dated = sorted.filter(has).reverse();
        return [...dated, ...sorted.filter((b) => !has(b))];
      }
      sorted.reverse();
    }
    return sorted;
  }, [books, filter, query, sort, sortAsc, moodFilter, paceFilter, haystacks]);

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
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common.clear')}>
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
                    <View style={[styles.filterDot, { backgroundColor: t.colors.primary, borderColor: t.colors.card }]} />
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                onPress={() => setSortOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('sort.heading')}
              >
                <View>
                  <Ionicons name="swap-vertical" size={20} color={t.colors.primary} />
                  {sortChanged ? (
                    <View style={[styles.filterDot, { backgroundColor: t.colors.primary, borderColor: t.colors.card }]} />
                  ) : null}
                </View>
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
          <Pressable onPress={exitSelect} hitSlop={8} style={styles.selectBtn} accessibilityRole="button" accessibilityLabel={tr('common.close')}>
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

      <BottomSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title={tr('sort.heading')}
        right={
          sortChanged ? (
            <Pressable onPress={resetSort} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.readBtnTxt, { color: t.colors.primary }]}>{tr('sort.reset')}</Text>
            </Pressable>
          ) : null
        }
      >
        {SORTS.map((s) => {
          const active = sort === s;
          return (
            <Pressable
              key={s}
              onPress={() => {
                setSort(s);
                if (!active) setSortOpen(false); // re-tapping the active sort flips direction
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.sheetRow,
                { backgroundColor: pressed ? t.colors.cardAlt : 'transparent' },
              ]}
            >
              <Text style={[styles.sheetLabel, { color: active ? t.colors.primary : t.colors.text, flex: 1 }]}>
                {tr(`sort.${s}`)}
              </Text>
              {active ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.sheetSub, { color: t.colors.textMuted }]}>
                    {tr(sortAsc ? 'sort.ascending' : 'sort.descending')}
                  </Text>
                  <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={18} color={t.colors.primary} />
                </View>
              ) : null}
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
  // Same colour as the icon it marks (the theme's primary), ringed in the
  // search box's background so it stays distinct from the icon in every theme.
  filterDot: { position: 'absolute', top: -4, right: -5, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
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
