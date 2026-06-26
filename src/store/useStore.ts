import { create } from 'zustand';
import {
  AppData,
  Book,
  BookNote,
  BookSearchResult,
  Goal,
  GoalType,
  ImportedBook,
  ReadingSession,
  ReadingStatus,
  Shelf,
} from '@/types';
import { emptyData, loadData, saveData } from '@/lib/storage';
import { toDateKey, uid } from '@/lib/utils';
import { SHELF_COLORS } from '@/theme/theme';
import { refreshWidgets } from '@/widgets/refresh';

interface StoreState extends AppData {
  hydrated: boolean;

  hydrate: () => Promise<void>;
  replaceAll: (data: AppData) => Promise<void>;

  // Books
  addBook: (result: BookSearchResult, status?: ReadingStatus) => Book;
  addManualBook: (input: Partial<Book> & { title: string }) => Book;
  addImportedBooks: (items: ImportedBook[]) => { added: number; skipped: number; addedIds: string[] };
  updateBook: (id: string, patch: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  deleteBooks: (ids: string[]) => { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] };
  restoreBooks: (data: { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] }) => void;
  setStatus: (id: string, status: ReadingStatus) => void;
  setProgress: (id: string, currentPage: number) => void;
  setRating: (id: string, rating: number) => void;
  toggleShelfForBook: (bookId: string, shelfId: string) => void;

  // Sessions
  addSession: (s: Omit<ReadingSession, 'id' | 'date'>) => ReadingSession;
  updateSession: (id: string, patch: Partial<Omit<ReadingSession, 'id'>>) => void;
  deleteSession: (id: string) => void;

  // Notes
  addNote: (n: Omit<BookNote, 'id' | 'createdAt'>) => BookNote;
  updateNote: (id: string, patch: Partial<BookNote>) => void;
  deleteNote: (id: string) => void;

  // Shelves
  addShelf: (input: { name: string; color?: string; icon?: string; emoji?: string }) => Shelf;
  updateShelf: (
    id: string,
    patch: Partial<Pick<Shelf, 'name' | 'color' | 'icon' | 'emoji'>>
  ) => void;
  deleteShelf: (id: string) => void;

  // Goals
  setGoal: (type: GoalType, target: number) => Goal;
  deleteGoal: (id: string) => void;
}

function persist(get: () => StoreState) {
  const { books, sessions, notes, shelves, goals, version } = get();
  void saveData({ books, sessions, notes, shelves, goals, version }).then(() => {
    void refreshWidgets();
  });
}

export const useStore = create<StoreState>((set, get) => ({
  ...emptyData,
  hydrated: false,

  hydrate: async () => {
    const data = await loadData();
    set({ ...data, hydrated: true });
  },

  replaceAll: async (data) => {
    set({ ...emptyData, ...data });
    await saveData({ ...emptyData, ...data });
  },

  addBook: (result, status = 'want_to_read') => {
    const now = Date.now();
    const book: Book = {
      id: uid('b_'),
      title: result.title,
      authors: result.authors,
      coverUrl: result.coverUrl,
      isbn: result.isbn,
      pageCount: result.pageCount,
      description: result.description,
      publisher: result.publisher,
      publishedDate: result.publishedDate,
      categories: result.categories,
      language: result.language,
      status,
      currentPage: 0,
      addedAt: now,
      startedAt: status === 'reading' ? now : undefined,
      shelfIds: [],
      source: result.source,
    };
    set((s) => ({ books: [book, ...s.books] }));
    persist(get);
    return book;
  },

  addManualBook: (input) => {
    const now = Date.now();
    const book: Book = {
      id: uid('b_'),
      title: input.title,
      authors: input.authors ?? [],
      coverUrl: input.coverUrl,
      isbn: input.isbn,
      pageCount: input.pageCount,
      description: input.description,
      status: input.status ?? 'want_to_read',
      currentPage: 0,
      series: input.series,
      seriesNumber: input.seriesNumber,
      moods: input.moods,
      pace: input.pace,
      addedAt: now,
      startedAt: input.status === 'reading' ? now : undefined,
      shelfIds: [],
      source: 'manual',
    };
    set((s) => ({ books: [book, ...s.books] }));
    persist(get);
    return book;
  },

  addImportedBooks: (items) => {
    const state = get();
    const shelfByName = new Map(state.shelves.map((s) => [s.name.toLowerCase(), s]));
    const newShelves: Shelf[] = [];
    const shelfIdFor = (name: string): string => {
      const key = name.trim().toLowerCase();
      let sh = shelfByName.get(key);
      if (!sh) {
        sh = {
          id: uid('sh_'),
          name: name.trim(),
          color: SHELF_COLORS[(state.shelves.length + newShelves.length) % SHELF_COLORS.length],
          createdAt: Date.now(),
        };
        shelfByName.set(key, sh);
        newShelves.push(sh);
      }
      return sh.id;
    };

    const keyOf = (b: { isbn?: string; title: string; authors: string[] }) =>
      b.isbn
        ? `isbn:${b.isbn}`
        : `t:${b.title.trim().toLowerCase()}|${(b.authors[0] ?? '').trim().toLowerCase()}`;

    const seen = new Set(state.books.map(keyOf));
    const toAdd: Book[] = [];
    let skipped = 0;

    for (const it of items) {
      if (!it.title?.trim()) {
        skipped++;
        continue;
      }
      const k = keyOf(it);
      if (seen.has(k)) {
        skipped++;
        continue;
      }
      seen.add(k);
      const now = Date.now();
      toAdd.push({
        id: uid('b_'),
        title: it.title.trim(),
        authors: it.authors ?? [],
        isbn: it.isbn,
        pageCount: it.pageCount,
        status: it.status,
        currentPage:
          it.currentPage ?? (it.status === 'finished' && it.pageCount ? it.pageCount : 0),
        rating: it.rating,
        review: it.review,
        series: it.series,
        seriesNumber: it.seriesNumber,
        moods: it.moods,
        pace: it.pace,
        publishedDate: it.publishedDate,
        addedAt: it.addedAt ?? now,
        startedAt: it.startedAt,
        finishedAt: it.finishedAt,
        shelfIds: (it.shelfNames ?? []).map(shelfIdFor),
        source: 'import',
      });
    }

    set((s) => ({ books: [...toAdd, ...s.books], shelves: [...s.shelves, ...newShelves] }));
    persist(get);
    return { added: toAdd.length, skipped, addedIds: toAdd.map((b) => b.id) };
  },

  updateBook: (id, patch) => {
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
    persist(get);
  },

  deleteBook: (id) => {
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      sessions: s.sessions.filter((x) => x.bookId !== id),
      notes: s.notes.filter((x) => x.bookId !== id),
    }));
    persist(get);
  },

  deleteBooks: (ids) => {
    const idSet = new Set(ids);
    const s = get();
    const removed = {
      books: s.books.filter((b) => idSet.has(b.id)),
      sessions: s.sessions.filter((x) => idSet.has(x.bookId)),
      notes: s.notes.filter((x) => idSet.has(x.bookId)),
    };
    set((st) => ({
      books: st.books.filter((b) => !idSet.has(b.id)),
      sessions: st.sessions.filter((x) => !idSet.has(x.bookId)),
      notes: st.notes.filter((x) => !idSet.has(x.bookId)),
    }));
    persist(get);
    return removed;
  },

  restoreBooks: ({ books, sessions, notes }) => {
    set((st) => ({
      books: [...books, ...st.books],
      sessions: [...sessions, ...st.sessions],
      notes: [...notes, ...st.notes],
    }));
    persist(get);
  },

  setStatus: (id, status) => {
    set((s) => ({
      books: s.books.map((b) => {
        if (b.id !== id) return b;
        const patch: Partial<Book> = { status };
        if (status === 'reading' && !b.startedAt) patch.startedAt = Date.now();
        if (status === 'finished') {
          patch.finishedAt = Date.now();
          if (b.pageCount) patch.currentPage = b.pageCount;
          if (b.status !== 'finished') patch.readCount = (b.readCount ?? 0) + 1;
        }
        return { ...b, ...patch };
      }),
    }));
    persist(get);
  },

  setProgress: (id, currentPage) => {
    set((s) => ({
      books: s.books.map((b) => {
        if (b.id !== id) return b;
        const max = b.pageCount && b.pageCount > 0 ? b.pageCount : Infinity;
        const page = Math.max(0, Math.min(currentPage, max));
        const patch: Partial<Book> = { currentPage: page };
        if (b.status === 'want_to_read' && page > 0) {
          patch.status = 'reading';
          patch.startedAt = b.startedAt ?? Date.now();
        }
        if (b.pageCount && page >= b.pageCount) {
          patch.status = 'finished';
          patch.finishedAt = b.finishedAt ?? Date.now();
          if (b.status !== 'finished') patch.readCount = (b.readCount ?? 0) + 1;
        }
        return { ...b, ...patch };
      }),
    }));
    persist(get);
  },

  setRating: (id, rating) => {
    get().updateBook(id, { rating });
  },

  toggleShelfForBook: (bookId, shelfId) => {
    set((s) => ({
      books: s.books.map((b) => {
        if (b.id !== bookId) return b;
        const has = b.shelfIds.includes(shelfId);
        return {
          ...b,
          shelfIds: has
            ? b.shelfIds.filter((x) => x !== shelfId)
            : [...b.shelfIds, shelfId],
        };
      }),
    }));
    persist(get);
  },

  addSession: (input) => {
    const session: ReadingSession = {
      ...input,
      id: uid('s_'),
      date: toDateKey(input.startTime),
    };
    set((s) => ({ sessions: [session, ...s.sessions] }));
    // advance reading progress if the session recorded an end page - but only
    // ever forward, so a mistyped lower "to page" can't regress the book.
    if (input.endPage != null) {
      const book = get().books.find((b) => b.id === input.bookId);
      const target = book ? Math.max(book.currentPage, input.endPage) : input.endPage;
      get().setProgress(input.bookId, target);
    } else {
      persist(get);
    }
    return session;
  },

  updateSession: (id, patch) => {
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        if (patch.startTime != null) next.date = toDateKey(patch.startTime);
        return next;
      }),
    }));
    // keep book progress in sync if the end page changed (forward only)
    const sess = get().sessions.find((x) => x.id === id);
    if (sess && patch.endPage != null) {
      const book = get().books.find((b) => b.id === sess.bookId);
      get().setProgress(sess.bookId, book ? Math.max(book.currentPage, patch.endPage) : patch.endPage);
    } else {
      persist(get);
    }
  },

  deleteSession: (id) => {
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    persist(get);
  },

  addNote: (input) => {
    const note: BookNote = { ...input, id: uid('n_'), createdAt: Date.now() };
    set((s) => ({ notes: [note, ...s.notes] }));
    persist(get);
    return note;
  },

  updateNote: (id, patch) => {
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
    persist(get);
  },

  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    persist(get);
  },

  addShelf: (input) => {
    const useEmoji = !!input.emoji;
    const shelf: Shelf = {
      id: uid('sh_'),
      name: input.name.trim(),
      color: input.color ?? SHELF_COLORS[get().shelves.length % SHELF_COLORS.length],
      icon: useEmoji ? undefined : input.icon,
      emoji: useEmoji ? input.emoji : undefined,
      createdAt: Date.now(),
    };
    set((s) => ({ shelves: [...s.shelves, shelf] }));
    persist(get);
    return shelf;
  },

  updateShelf: (id, patch) => {
    set((s) => ({
      shelves: s.shelves.map((sh) => {
        if (sh.id !== id) return sh;
        const next: Shelf = { ...sh, ...patch };
        if (patch.name != null) next.name = patch.name.trim();
        // marker is mutually exclusive: setting one clears the other
        if (patch.emoji) next.icon = undefined;
        if (patch.icon) next.emoji = undefined;
        return next;
      }),
    }));
    persist(get);
  },

  deleteShelf: (id) => {
    set((s) => ({
      shelves: s.shelves.filter((sh) => sh.id !== id),
      books: s.books.map((b) => ({
        ...b,
        shelfIds: b.shelfIds.filter((x) => x !== id),
      })),
    }));
    persist(get);
  },

  setGoal: (type, target) => {
    const year = new Date().getFullYear();
    // Only books_per_year is scoped to a year; daily goals carry over across years.
    const existing = get().goals.find(
      (g) => g.type === type && (type === 'books_per_year' ? g.year === year : true)
    );
    if (existing) {
      set((s) => ({
        goals: s.goals.map((g) => (g.id === existing.id ? { ...g, target } : g)),
      }));
      persist(get);
      return { ...existing, target };
    }
    const goal: Goal = {
      id: uid('g_'),
      type,
      target,
      year,
      createdAt: Date.now(),
    };
    set((s) => ({ goals: [...s.goals, goal] }));
    persist(get);
    return goal;
  },

  deleteGoal: (id) => {
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
    persist(get);
  },
}));

// Selectors / helpers
export function useBook(id: string | undefined): Book | undefined {
  return useStore((s) => s.books.find((b) => b.id === id));
}
