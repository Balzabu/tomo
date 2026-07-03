import { create } from 'zustand';
import { AppState } from 'react-native';
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
import { emptyData, loadData, saveData, PERSIST_FAILED } from '@/lib/storage';
import { toDateKey, uid } from '@/lib/utils';
import { SHELF_COLORS } from '@/theme/theme';
import { refreshWidgets } from '@/widgets/refresh';
import { useSnackbar } from '@/store/useSnackbar';
import { useSettings } from '@/store/useSettings';
import { resolveLang, translate } from '@/i18n';

interface StoreState extends AppData {
  hydrated: boolean;

  hydrate: () => Promise<void>;
  replaceAll: (data: AppData) => Promise<void>;

  // Books
  addBook: (result: BookSearchResult, status?: ReadingStatus) => Book;
  addManualBook: (input: Partial<Book> & { title: string }) => Book;
  addImportedBooks: (items: ImportedBook[]) => { added: number; skipped: number; addedIds: string[] };
  updateBook: (id: string, patch: Partial<Book>) => void;
  updateBooks: (patches: { id: string; patch: Partial<Book> }[]) => void;
  deleteBook: (id: string) => void;
  deleteBooks: (ids: string[]) => { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] };
  restoreBooks: (data: { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] }) => void;
  setStatus: (id: string, status: ReadingStatus) => void;
  setProgress: (id: string, currentPage: number) => void;
  setRating: (id: string, rating: number) => void;
  startReread: (id: string) => void;
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

// --- Debounced persistence -------------------------------------------------
// Every mutation used to serialise the whole DB to disk *and* re-read all of it
// back to refresh the widgets. We now coalesce a burst of mutations into a
// single write (bounded within PERSIST_DEBOUNCE_MS) and hand the in-memory
// snapshot to the widgets so they never re-read what we just wrote. Any pending
// write is flushed immediately when the app is backgrounded, so nothing is lost
// if the OS then kills the process.
const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let latestGet: (() => StoreState) | null = null;

function snapshot(get: () => StoreState): AppData {
  const { books, sessions, notes, shelves, goals, version } = get();
  return { books, sessions, notes, shelves, goals, version };
}

// Tell the user a disk write failed (storage full / AsyncStorage limit) - the
// in-memory state is fine, but nothing since the last successful write would
// survive a restart.
function notifyPersistFailure(): void {
  const snack = useSnackbar.getState();
  // Never replace an action snackbar (e.g. delete-undo): stealing it would
  // take the Undo button away mid-window and fire its dismiss cleanup early.
  // The write stays pending, so a later failure re-notifies.
  if (snack.message != null && snack.actionLabel) return;
  const lang = resolveLang(useSettings.getState().language);
  snack.show(translate(lang, 'data.saveFailed'));
}

// Monotonic flush id: a failed older flush must not re-arm the pending marker
// or alarm the user when a newer flush has already taken over.
let flushSeq = 0;

function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!latestGet) return;
  const get = latestGet;
  const data = snapshot(get);
  // Clear the pending marker so an unchanged store isn't re-serialised (and all
  // widgets re-rendered) on every subsequent app backgrounding.
  latestGet = null;
  const seq = ++flushSeq;
  void saveData(data).then((ok) => {
    if (ok) return refreshWidgets(data);
    if (seq !== flushSeq) return; // a newer flush reports its own outcome
    // Keep the write pending so the next mutation/backgrounding retries it,
    // unless a newer mutation already re-armed it.
    latestGet = latestGet ?? get;
    notifyPersistFailure();
  });
}

// Drop any queued incremental write (timer *and* pending marker) - used when a
// full replace is about to supersede it, so a stray flush can't resurrect the
// old dataset in the middle of a restore or clear-all.
function cancelPendingPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  latestGet = null;
}

function persist(get: () => StoreState) {
  latestGet = get;
  // A flush is already scheduled; it will read the latest state when it fires.
  if (persistTimer) return;
  persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
}

// Flush any pending write before the app is backgrounded / killed.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') flushPersist();
});

export const useStore = create<StoreState>((set, get) => ({
  ...emptyData,
  hydrated: false,

  hydrate: async () => {
    const data = await loadData();
    set({ ...data, hydrated: true });
  },

  replaceAll: async (data) => {
    // A full replace supersedes any queued incremental write.
    cancelPendingPersist();
    const prev = snapshot(get);
    const next: AppData = { ...emptyData, ...data };
    set(next);
    const ok = await saveData(next, { force: true });
    if (!ok) {
      // Roll the memory back so UI, disk and widgets keep agreeing - a
      // "failed" import must not stay live on screen and then get silently
      // committed by the next successful incremental write.
      set(prev);
      throw new Error(PERSIST_FAILED);
    }
    void refreshWidgets(next);
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

    // Match on ISBN *and* title|author: a book that exists with an ISBN must
    // still be recognised when the CSV row lacks one (or carries the ISBN-10
    // where the library has the ISBN-13).
    const keysOf = (b: { isbn?: string; title: string; authors: string[] }) => {
      const keys = [
        `t:${b.title.trim().toLowerCase()}|${(b.authors[0] ?? '').trim().toLowerCase()}`,
      ];
      if (b.isbn) keys.push(`isbn:${b.isbn}`);
      return keys;
    };

    const seen = new Set(state.books.flatMap(keysOf));
    const toAdd: Book[] = [];
    let skipped = 0;

    for (const it of items) {
      if (!it.title?.trim()) {
        skipped++;
        continue;
      }
      const keys = keysOf(it);
      if (keys.some((k) => seen.has(k))) {
        skipped++;
        continue;
      }
      keys.forEach((k) => seen.add(k));
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

  // Apply many book patches in a single state update + persist (used by
  // background enrichment so it doesn't rewrite the whole DB once per book).
  updateBooks: (patches) => {
    if (patches.length === 0) return;
    const map = new Map(patches.map((p) => [p.id, p.patch]));
    set((s) => ({
      books: s.books.map((b) => {
        const patch = map.get(b.id);
        return patch ? { ...b, ...patch } : b;
      }),
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
        // Re-tapping the already-active status must be a no-op: without this,
        // tapping "Finished" on a finished book stamps finishedAt with *today*,
        // silently moving it into the current year's stats.
        if (b.status === status) return b;
        const patch: Partial<Book> = { status };
        if (status === 'reading' && !b.startedAt) patch.startedAt = Date.now();
        // Leaving "finished" clears the finish date so a later re-read records a
        // fresh one instead of silently keeping the stale year.
        if (status !== 'finished' && b.status === 'finished') patch.finishedAt = undefined;
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
          // Fresh date on a *new* completion (matches setStatus); keep the
          // existing one when the book was already finished.
          patch.finishedAt = b.status !== 'finished' ? Date.now() : b.finishedAt;
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

  // Start a fresh read cycle on a finished book: back to "reading" from page 0,
  // clearing the old finish date. readCount is preserved and gets bumped again
  // when this cycle reaches the end (via setProgress/setStatus).
  startReread: (id) => {
    set((s) => ({
      books: s.books.map((b) =>
        b.id === id
          ? { ...b, status: 'reading', currentPage: 0, startedAt: Date.now(), finishedAt: undefined }
          : b
      ),
    }));
    persist(get);
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
      // Day-bucket on the END time: a session crossing midnight belongs to the
      // day you were reading at 00:30, so today's goals/streak credit it
      // immediately instead of assigning it to a yesterday the UI never
      // revisits. (For same-day sessions the two are identical.)
      date: toDateKey(input.endTime ?? input.startTime),
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
        // Keep the day bucket in sync with the (possibly edited) times - end
        // time wins, matching addSession.
        if (patch.startTime != null || patch.endTime != null) {
          next.date = toDateKey(next.endTime ?? next.startTime);
        }
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

/**
 * Find a library book matching a search/scan result - by ISBN first, then by
 * title|first-author (same matching the CSV import uses). Lets add flows warn
 * about a duplicate instead of silently creating a second copy.
 */
export function findExistingBook(
  books: Book[],
  b: { isbn?: string; title: string; authors?: string[] }
): Book | undefined {
  const titleKey = `${b.title.trim().toLowerCase()}|${(b.authors?.[0] ?? '').trim().toLowerCase()}`;
  return books.find((x) => {
    if (b.isbn && x.isbn && x.isbn === b.isbn) return true;
    return (
      `${x.title.trim().toLowerCase()}|${(x.authors[0] ?? '').trim().toLowerCase()}` === titleKey
    );
  });
}
