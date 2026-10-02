import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TextInput } from '@/components/ThemedTextInput';
import { useStore } from '@/store/useStore';
import { useSnackbar } from '@/store/useSnackbar';
import { Book, BookNote, NoteType } from '@/types';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { EmptyState } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { NoteItem, NoteModal } from '@/components/NoteEditor';
import { QuoteShareModal } from '@/components/QuoteShareModal';
import { BottomSheet } from '@/components/BottomSheet';
import { BookCover } from '@/components/BookCover';

type Filter = 'all' | NoteType;
type Order = 'recent' | 'book';

/** Lower-case and strip accents so "perche" finds "perché". */
function fold(s: string): string {
  try {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

type Row = { kind: 'header'; book: Book; count: number } | { kind: 'note'; note: BookNote; book: Book };

/** Every note and quote across the library, searchable. */
export default function NotesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const params = useLocalSearchParams<{ type?: string }>();
  const books = useStore((s) => s.books);
  const notes = useStore((s) => s.notes);
  const store = useStore.getState;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(params.type === 'quote' || params.type === 'note' ? params.type : 'all');
  const [order, setOrder] = useState<Order>('recent');
  const [edit, setEdit] = useState<BookNote | null>(null);
  const [share, setShare] = useState<BookNote | null>(null);
  const [pickBook, setPickBook] = useState(false);
  const [newFor, setNewFor] = useState<Book | null>(null);
  const [pickQuery, setPickQuery] = useState('');

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const counts = useMemo(() => {
    let quote = 0;
    for (const n of notes) if (n.type === 'quote') quote++;
    return { all: notes.length, quote, note: notes.length - quote };
  }, [notes]);

  // Folded search text per note, built on first use and kept until the notes
  // or books change - so each keystroke is a plain substring scan instead of
  // re-normalising the whole collection.
  const haystackOf = useMemo(() => {
    const cache = new Map<BookNote, string>();
    return (n: BookNote, b: Book) => {
      let h = cache.get(n);
      if (h === undefined) {
        h = fold(`${n.text} ${b.title} ${b.authors.join(' ')}`);
        cache.set(n, h);
      }
      return h;
    };
  }, [notes, bookById]);

  const rows = useMemo<Row[]>(() => {
    const q = fold(query.trim());
    const list = notes.filter((n) => {
      if (filter !== 'all' && n.type !== filter) return false;
      const b = bookById.get(n.bookId);
      if (!b) return false;
      if (!q) return true;
      return haystackOf(n, b).includes(q);
    });
    if (order === 'recent') {
      return list
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((n) => ({ kind: 'note' as const, note: n, book: bookById.get(n.bookId)! }));
    }
    const groups = new Map<string, BookNote[]>();
    for (const n of list) {
      const g = groups.get(n.bookId);
      if (g) g.push(n);
      else groups.set(n.bookId, [n]);
    }
    const out: Row[] = [];
    [...groups.entries()]
      .map(([id, ns]) => ({ book: bookById.get(id)!, ns }))
      .sort((a, b) => a.book.title.localeCompare(b.book.title))
      .forEach(({ book, ns }) => {
        out.push({ kind: 'header', book, count: ns.length });
        ns.sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.createdAt - b.createdAt).forEach((n) =>
          out.push({ kind: 'note', note: n, book })
        );
      });
    return out;
  }, [notes, filter, query, order, bookById, haystackOf]);

  const remove = useCallback(
    (n: BookNote) => {
      const removed = store().deleteNote(n.id);
      if (!removed) return;
      useSnackbar.getState().show(tr(n.type === 'quote' ? 'quote.deleted' : 'note.deleted'), {
        actionLabel: tr('common.undo'),
        onAction: () => store().restoreNote(removed),
      });
    },
    [tr, store]
  );

  // Books to attach a new entry to: what you're reading first, then the rest.
  const pickable = useMemo(() => {
    const rank = (b: Book) => (b.status === 'reading' ? 0 : b.status === 'paused' ? 1 : b.status === 'finished' ? 2 : 3);
    const q = fold(pickQuery.trim());
    return books
      .filter((b) => !q || fold(`${b.title} ${b.authors.join(' ')}`).includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [books, pickQuery]);

  const shareBook = share ? bookById.get(share.bookId) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}>
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr('notes.search')}
            placeholderTextColor={t.colors.textFaint}
            style={[styles.searchInput, { color: t.colors.text }]}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={tr('common.clear')}>
              <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.pills}>
          <View style={{ flex: 1 }}>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={(['all', 'quote', 'note'] as Filter[]).map((f) => ({ value: f, label: `${tr(`notes.filter.${f}`)} ${counts[f]}` }))}
            />
          </View>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setOrder((o) => (o === 'recent' ? 'book' : 'recent'));
            }}
            hitSlop={8}
            style={[styles.orderBtn, { backgroundColor: t.colors.cardAlt }]}
            accessibilityRole="button"
            accessibilityLabel={order === 'recent' ? tr('notes.byBook') : tr('notes.byRecent')}
          >
            <Ionicons name={order === 'recent' ? 'time-outline' : 'library-outline'} size={18} color={t.colors.primary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'header' ? `h-${r.book.id}` : r.note.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          notes.length === 0 ? (
            <EmptyState icon="chatbox-ellipses-outline" title={tr('notes.emptyTitle')} subtitle={tr('notes.emptySub')} />
          ) : (
            <EmptyState icon="search" title={tr('notes.noMatch')} />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Pressable onPress={() => router.push(`/book/${item.book.id}`)} style={styles.groupHead} accessibilityRole="link">
              <BookCover uri={item.book.coverUrl} title={item.book.title} width={30} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupTitle, { color: t.colors.text }]} numberOfLines={1}>
                  {item.book.title}
                </Text>
                <Text style={[styles.groupSub, { color: t.colors.textFaint }]} numberOfLines={1}>
                  {item.book.authors.join(', ') || tr('common.unknownAuthor')}
                </Text>
              </View>
              <Text style={[styles.groupSub, { color: t.colors.textFaint }]}>{item.count}</Text>
            </Pressable>
          ) : (
            <NoteRow
              note={item.note}
              book={item.book}
              showBook={order === 'recent'}
              onEdit={setEdit}
              onShare={setShare}
              onDelete={remove}
            />
          )
        }
      />

      {books.length > 0 ? (
        <Pressable
          onPress={() => setPickBook(true)}
          style={[styles.fab, { backgroundColor: t.colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={tr('notes.add')}
        >
          <Ionicons name="add" size={30} color={onColor(t.colors.primary)} />
        </Pressable>
      ) : null}

      <BottomSheet visible={pickBook} onClose={() => setPickBook(false)} title={tr('notes.pickBook')} onShow={() => setPickQuery('')}>
        {books.length > 6 ? (
          <View style={[styles.search, styles.pickSearch, { backgroundColor: t.colors.cardAlt, borderColor: t.colors.border }]}>
            <Ionicons name="search" size={16} color={t.colors.textFaint} />
            <TextInput
              value={pickQuery}
              onChangeText={setPickQuery}
              placeholder={tr('notes.pickSearch')}
              placeholderTextColor={t.colors.textFaint}
              style={[styles.searchInput, { color: t.colors.text }]}
            />
          </View>
        ) : null}
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={pickable}
          keyExtractor={(b) => b.id}
          style={{ maxHeight: 460 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setPickBook(false);
                setNewFor(item);
              }}
              style={styles.pickRow}
            >
              <BookCover uri={item.coverUrl} title={item.title} width={34} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupTitle, { color: t.colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.groupSub, { color: t.colors.textFaint }]} numberOfLines={1}>
                  {[item.authors[0], tr(`status.${item.status}`)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </BottomSheet>

      <NoteModal
        open={edit !== null || newFor !== null}
        type={edit?.type ?? (filter === 'note' ? 'note' : 'quote')}
        initial={edit ? { text: edit.text, page: edit.page } : undefined}
        defaultPage={newFor?.currentPage}
        subtitle={(edit ? bookById.get(edit.bookId) : newFor)?.title}
        onClose={() => {
          setEdit(null);
          setNewFor(null);
        }}
        onSave={(text, page, type) => {
          if (text.trim()) {
            if (edit) store().updateNote(edit.id, { text: text.trim(), page, type });
            else if (newFor) store().addNote({ bookId: newFor.id, type, text: text.trim(), page });
            void Haptics.selectionAsync();
          }
          setEdit(null);
          setNewFor(null);
        }}
        onDelete={
          edit
            ? () => {
                const n = edit;
                setEdit(null);
                remove(n);
              }
            : undefined
        }
      />

      <QuoteShareModal
        visible={share !== null}
        quote={share?.text}
        title={shareBook?.title ?? ''}
        author={shareBook?.authors.join(', ') || tr('common.unknownAuthor')}
        page={share?.page}
        coverUrl={shareBook?.coverUrl}
        onClose={() => setShare(null)}
      />
    </View>
  );
}

/** A note in the list. Memoised with stable callbacks, so typing in the
 *  search box or saving one note doesn't re-render every other card. */
const NoteRow = memo(function NoteRow({
  note,
  book,
  showBook,
  onEdit,
  onShare,
  onDelete,
}: {
  note: BookNote;
  book: Book;
  showBook: boolean;
  onEdit: (n: BookNote) => void;
  onShare: (n: BookNote) => void;
  onDelete: (n: BookNote) => void;
}) {
  const t = useTheme();
  return (
    <NoteItem
      note={note}
      onEdit={() => onEdit(note)}
      onShare={note.type === 'quote' ? () => onShare(note) : undefined}
      onDelete={() => onDelete(note)}
      footer={
        showBook ? (
          <Pressable onPress={() => router.push(`/book/${book.id}`)} hitSlop={6} accessibilityRole="link">
            <Text style={[styles.bookLink, { color: t.colors.primary }]} numberOfLines={1}>
              {book.title}
              {book.authors[0] ? ` · ${book.authors[0]}` : ''}
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
});

const styles = StyleSheet.create({
  top: { padding: spacing.lg, gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderBtn: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  groupTitle: { fontSize: 15, fontWeight: '700' },
  groupSub: { fontSize: 12 },
  bookLink: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  pickSearch: { height: 42, marginBottom: spacing.sm, borderRadius: radius.md },
});
