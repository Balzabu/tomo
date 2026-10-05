import { create } from 'zustand';
import { AppState, InteractionManager } from 'react-native';
import {
  AppData,
  Book,
  BookNote,
  BookSearchResult,
  Goal,
  GoalMetric,
  GoalPeriod,
  ReadRecord,
  ReadingSession,
  ReadingStatus,
  Shelf,
} from '@/types';
import {
  emptyData,
  loadData,
  saveData,
  didReadFail,
  lastSaveFootprint,
  PERSIST_FAILED,
} from '@/lib/storage';
import { STORAGE_WARN_CHARS } from '@/lib/storageCore';
import { uid } from '@/lib/utils';
import { readingDayKey, sessionDay } from '@/lib/readingDay';
import { isbnKey, keepIsbn, normalizeBookIsbns } from '@/lib/isbn';
import { finishFields, sanitizeReads, withRereadStarted } from '@/lib/reads';
import { legacyTypeOf, normalizeGoals } from '@/lib/goals';
import { mergeData, MergeSummary, stampChanges } from '@/lib/sync';
import type { ImportBundle } from '@/lib/importBundle';
import { SHELF_COLORS } from '@/theme/theme';
import { refreshWidgets } from '@/widgets/refresh';
import { useSnackbar } from '@/store/useSnackbar';
import { useSettings } from '@/store/useSettings';
import { resolveLang, translate } from '@/i18n';

interface StoreState extends AppData {
  hydrated: boolean;

  hydrate: () => Promise<void>;
  replaceAll: (data: AppData) => Promise<void>;
  /** Merge a backup into the library (newer copy of each item wins). Returns
   *  what changed plus local cover files no book references any more. */
  mergeAll: (data: AppData) => Promise<{ summary: MergeSummary; orphanedCovers: string[] }>;

  // Books
  addBook: (result: BookSearchResult, status?: ReadingStatus) => Book;
  addManualBook: (input: Partial<Book> & { title: string }) => Book;
  /** Import books with their notes and sessions (another app's export).
   *  Books already in the library are matched, not duplicated - their notes
   *  and sessions are still added when missing. Covers must already be URLs. */
  importBundle: (bundle: ImportBundle) => {
    added: number;
    matched: number;
    notes: number;
    sessions: number;
    addedIds: string[];
  };
  updateBook: (id: string, patch: Partial<Book>) => void;
  updateBooks: (
    patches: { id: string; patch: Partial<Book> }[],
    onlyIf?: (current: Book) => boolean
  ) => void;
  deleteBook: (id: string) => void;
  deleteBooks: (ids: string[]) => { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] };
  restoreBooks: (data: { books: Book[]; sessions: ReadingSession[]; notes: BookNote[] }) => void;
  setStatus: (id: string, status: ReadingStatus) => void;
  setProgress: (id: string, currentPage: number) => void;
  setRating: (id: string, rating: number) => void;
  startReread: (id: string) => void;
  /** Edit the reading dates by hand (null clears). Never touches status or
   *  readCount: this is a correction, not a state change. */
  setReadDates: (
    id: string,
    patch: { startedAt?: number | null; finishedAt?: number | null; reads?: ReadRecord[] }
  ) => void;
  toggleShelfForBook: (bookId: string, shelfId: string) => void;

  // Sessions
  addSession: (s: Omit<ReadingSession, 'id' | 'date'>) => ReadingSession;
  updateSession: (id: string, patch: Partial<Omit<ReadingSession, 'id'>>) => void;
  deleteSession: (id: string) => void;

  // Notes
  addNote: (n: Omit<BookNote, 'id' | 'createdAt'>) => BookNote;
  updateNote: (id: string, patch: Partial<BookNote>) => void;
  deleteNote: (id: string) => BookNote | undefined;
  /** Put a just-deleted note back (delete-undo). */
  restoreNote: (note: BookNote) => void;

  // Shelves
  addShelf: (input: { name: string; color?: string; icon?: string; emoji?: string }) => Shelf;
  updateShelf: (
    id: string,
    patch: Partial<Pick<Shelf, 'name' | 'color' | 'icon' | 'emoji'>>
  ) => void;
  deleteShelf: (id: string) => void;

  // Goals
  /** Create or update a goal. Recurring goals (day/month/year) are unique per
   *  metric+period, so saving one replaces the existing target. */
  saveGoal: (input: {
    id?: string;
    metric: GoalMetric;
    period: GoalPeriod;
    target: number;
    start?: string;
    end?: string;
    name?: string;
  }) => Goal;
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
  const { books, sessions, notes, shelves, goals, deleted, version } = get();
  return { books, sessions, notes, shelves, goals, deleted, version };
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

// Warn once per app session when the serialised library gets large (or a
// single record can't be chunked) - long before the storage DB fills up.
let storageWarned = false;
function notifyStorageLarge(): void {
  if (storageWarned) return;
  const fp = lastSaveFootprint();
  if (!fp || (fp.totalChars < STORAGE_WARN_CHARS && fp.oversizedItems === 0)) return;
  const snack = useSnackbar.getState();
  if (snack.message != null && snack.actionLabel) return; // don't steal an undo
  storageWarned = true;
  const lang = resolveLang(useSettings.getState().language);
  snack.show(translate(lang, 'data.storageLarge'));
}

// Monotonic flush id: a failed older flush must not re-arm the pending marker
// or alarm the user when a newer flush has already taken over.
let flushSeq = 0;

function flushPersist(): Promise<boolean> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!latestGet) return Promise.resolve(true);
  const get = latestGet;
  const data = snapshot(get);
  // Clear the pending marker so an unchanged store isn't re-serialised (and all
  // widgets re-rendered) on every subsequent app backgrounding.
  latestGet = null;
  const seq = ++flushSeq;
  return saveData(data).then((ok) => {
    if (ok) {
      notifyStorageLarge();
      // Rendering every placed widget is real JS work: let a running
      // animation or gesture (the screen that caused this save) finish first.
      InteractionManager.runAfterInteractions(() => void refreshWidgets(data));
      return true;
    }
    if (seq !== flushSeq) return false; // a newer flush reports its own outcome
    // Keep the write pending so the next mutation/backgrounding retries it,
    // unless a newer mutation already re-armed it.
    latestGet = latestGet ?? get;
    notifyPersistFailure();
    return false;
  });
}

/** Write any pending change now; true once it is on disk. For cleanup that
 *  must only happen after the data no longer points at something (e.g. an old
 *  cover file). */
export function persistNow(): Promise<boolean> {
  return flushPersist();
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
  // Invalidate any in-flight flush too: if it fails after the replace it must
  // neither re-arm the (now superseded) snapshot nor alarm the user.
  ++flushSeq;
}

function persist(get: () => StoreState) {
  latestGet = get;
  // A flush is already scheduled; it will read the latest state when it fires.
  if (persistTimer) return;
  persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
}

// Flush any pending write before the app is backgrounded / killed.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') void flushPersist();
});

/** Merge a metadata patch into a book. Corrections must never leave
 *  impossible progress such as page 400 of a book whose corrected length is
 *  300 pages, and a finished book always sits on its last page. */
function applyBookPatch(b: Book, patch: Partial<Book>): Book {
  const next = { ...b, ...patch };
  if ('isbn' in patch) next.isbn = keepIsbn(patch.isbn);
  if (patch.pageCount !== undefined && next.pageCount) {
    if (next.status === 'finished' || next.currentPage > next.pageCount) {
      next.currentPage = next.pageCount;
    }
  }
  return next;
}

/** A book moved to `currentPage` (clamped to its length): starts it when it
 *  leaves want-to-read, finishes it on the last page, and moves a finished
 *  book back to reading when the page is corrected downwards. Always returns
 *  a new object (the change is stamped even when the page is the same). */
function applyProgress(b: Book, currentPage: number): Book {
  const max = b.pageCount && b.pageCount > 0 ? b.pageCount : Infinity;
  const page = Math.max(0, Math.min(currentPage, max));
  const patch: Partial<Book> = { currentPage: page };
  if (b.status === 'want_to_read' && page > 0) {
    patch.status = 'reading';
    patch.startedAt = b.startedAt ?? Date.now();
  }
  if (b.pageCount && page >= b.pageCount) {
    patch.status = 'finished';
    // startReread clears finishedAt; ordinary status corrections keep it.
    // Re-saving the last page of a book already read (imported without a
    // date) is not a new read - see finishFields.
    Object.assign(patch, finishFields(b, Date.now()));
  } else if (b.status === 'finished' && b.pageCount && page < b.pageCount) {
    // Moving a finished book back to an earlier page is a correction
    // ("I hadn't actually finished"): it can't stay "finished at page
    // 50 of 300". finishedAt/readCount are kept, like setStatus does.
    patch.status = 'reading';
  }
  return { ...b, ...patch };
}

export const useStore = create<StoreState>((rawSet, get) => {
  // Every mutation goes through here: items whose object changed get
  // `updatedAt`, removed ones a tombstone (see src/lib/sync.ts). Loading and
  // full replaces use rawSet - they must keep the timestamps they carry.
  const set = (
    partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState> | StoreState)
  ) =>
    rawSet((s) => {
      const patch = typeof partial === 'function' ? partial(s) : partial;
      return patch === s ? s : stampChanges(s, patch);
    });

  // The load behind hydrate(), run at most once at a time (see hydrate).
  let hydrating: Promise<void> | null = null;
  const hydrateOnce = async () => {
    if (get().hydrated) return;
    const data = await loadData();
    // One-shot, idempotent: books saved before ISBN normalisation get their
    // canonical ISBN-13 (same array ref when nothing changes, so no write).
    const { books, changed } = normalizeBookIsbns(data.books);
    // Pre-1.4 goals ({type, year}) become metric+period goals.
    const goals = normalizeGoals(data.goals);
    const goalsChanged =
      goals.length !== data.goals.length ||
      data.goals.some((g) => !(g as Partial<Goal>).metric);
    rawSet({ ...data, books, goals, deleted: data.deleted ?? [], hydrated: true });
    if (changed || goalsChanged) persist(get);
    if (didReadFail()) {
      // Tell the user why the library is empty and that changes won't be
      // saved, rather than letting them rebuild it on top of a blocked disk.
      const lang = resolveLang(useSettings.getState().language);
      useSnackbar.getState().show(translate(lang, 'data.loadFailed'));
    }
  };

  return {
  ...emptyData,
  hydrated: false,

  hydrate: () => {
    // Once per process: the root layout can remount (a deep link into the
    // running app), and re-reading the disk then would throw away changes
    // still waiting in the debounced write. A remount *during* the first load
    // gets the same promise instead of starting a second read that would
    // land later and overwrite what the user did meanwhile.
    if (!hydrating) {
      const run = hydrateOnce();
      hydrating = run;
      // A failed load may be retried by the next call, as before.
      run.catch(() => {
        if (hydrating === run) hydrating = null;
      });
    }
    return hydrating;
  },

  replaceAll: async (data) => {
    // A full replace supersedes any queued incremental write.
    cancelPendingPersist();
    const prev = snapshot(get);
    const next: AppData = { ...emptyData, ...data, goals: normalizeGoals(data.goals ?? []) };
    rawSet(next);
    const ok = await saveData(next, { force: true });
    if (!ok) {
      // Roll the memory back so UI, disk and widgets keep agreeing - a
      // "failed" import must not stay live on screen and then get silently
      // committed by the next successful incremental write.
      rawSet(prev);
      // The replace cancelled any pending write of `prev`: re-arm it, or
      // changes made just before the failed restore/clear would never reach
      // disk. (Not when the disk couldn't be read - writes are blocked then.)
      if (!didReadFail()) persist(get);
      throw new Error(PERSIST_FAILED);
    }
    void refreshWidgets(next);
  },

  mergeAll: async (data) => {
    const incoming: AppData = { ...emptyData, ...data, goals: normalizeGoals(data.goals ?? []) };
    const { data: merged, summary, orphanedCovers } = mergeData(snapshot(get), incoming);
    await get().replaceAll(merged);
    return { summary, orphanedCovers };
  },

  addBook: (result, status = 'want_to_read') => {
    const now = Date.now();
    const isFinished = status === 'finished';
    const book: Book = {
      id: uid('b_'),
      title: result.title,
      authors: result.authors,
      coverUrl: result.coverUrl,
      isbn: keepIsbn(result.isbn),
      pageCount: result.pageCount,
      description: result.description,
      publisher: result.publisher,
      publishedDate: result.publishedDate,
      categories: result.categories,
      language: result.language,
      status,
      currentPage: isFinished && result.pageCount ? result.pageCount : 0,
      addedAt: now,
      startedAt: status === 'reading' ? now : undefined,
      finishedAt: isFinished ? now : undefined,
      readCount: isFinished ? 1 : undefined,
      shelfIds: [],
      source: result.source,
      // Straight from the catalogues: nothing more to ask them about this ISBN.
      catalogCheckedIsbn: keepIsbn(result.isbn),
    };
    set((s) => ({ books: [book, ...s.books] }));
    persist(get);
    return book;
  },

  addManualBook: (input) => {
    const now = Date.now();
    const status = input.status ?? 'want_to_read';
    const isFinished = status === 'finished';
    const book: Book = {
      id: uid('b_'),
      title: input.title,
      authors: input.authors ?? [],
      coverUrl: input.coverUrl,
      isbn: keepIsbn(input.isbn),
      pageCount: input.pageCount,
      description: input.description,
      status,
      currentPage: isFinished && input.pageCount ? input.pageCount : 0,
      series: input.series,
      seriesNumber: input.seriesNumber,
      moods: input.moods,
      pace: input.pace,
      addedAt: now,
      startedAt: status === 'reading' ? now : undefined,
      finishedAt: isFinished ? now : undefined,
      readCount: isFinished ? 1 : undefined,
      shelfIds: [],
      source: 'manual',
    };
    set((s) => ({ books: [book, ...s.books] }));
    persist(get);
    return book;
  },

  importBundle: (bundle) => {
    const state = get();
    const shelfByName = new Map(state.shelves.map((sh) => [sh.name.toLowerCase(), sh]));
    const newShelves: Shelf[] = [];
    const shelfIdFor = (name: string): string => {
      const k = name.trim().toLowerCase();
      let sh = shelfByName.get(k);
      if (!sh) {
        sh = {
          id: uid('sh_'),
          name: name.trim(),
          color: SHELF_COLORS[(state.shelves.length + newShelves.length) % SHELF_COLORS.length],
          createdAt: Date.now(),
        };
        shelfByName.set(k, sh);
        newShelves.push(sh);
      }
      return sh.id;
    };
    const keysOf = (b: { isbn?: string; title: string; authors: string[] }) => {
      const keys = [`t:${b.title.trim().toLowerCase()}|${(b.authors[0] ?? '').trim().toLowerCase()}`];
      const ik = isbnKey(b.isbn);
      if (ik) keys.push(`isbn:${ik}`);
      return keys;
    };
    const idByKey = new Map<string, string>();
    for (const b of state.books) for (const k of keysOf(b)) if (!idByKey.has(k)) idByKey.set(k, b.id);

    const bookIdFor = new Map<string, string>(); // bundle key -> library id
    const toAdd: Book[] = [];
    let matched = 0;
    for (const it of bundle.books) {
      const keys = keysOf(it);
      // Different editions (both have ISBNs, and they differ) are separate books.
      const ik = isbnKey(it.isbn);
      const existing = keys
        .map((k) => idByKey.get(k))
        .find((id) => {
          if (!id) return false;
          const other = isbnKey(state.books.find((b) => b.id === id)?.isbn ?? toAdd.find((b) => b.id === id)?.isbn);
          return !ik || !other || ik === other;
        });
      if (existing) {
        bookIdFor.set(it.key, existing);
        matched++;
        continue;
      }
      const now = Date.now();
      const book: Book = {
        id: uid('b_'),
        title: it.title.trim(),
        authors: it.authors ?? [],
        coverUrl: it.coverUrl,
        isbn: keepIsbn(it.isbn),
        pageCount: it.pageCount,
        description: it.description,
        publisher: it.publisher,
        publishedDate: it.publishedDate,
        language: it.language,
        status: it.status,
        currentPage: it.currentPage ?? (it.status === 'finished' && it.pageCount ? it.pageCount : 0),
        rating: it.rating,
        review: it.review,
        series: it.series,
        seriesNumber: it.seriesNumber,
        moods: it.moods,
        pace: it.pace,
        addedAt: it.addedAt ?? now,
        startedAt: it.startedAt,
        finishedAt: it.finishedAt,
        readCount: it.readCount ?? (it.status === 'finished' ? 1 : undefined),
        reads: sanitizeReads(it.reads),
        shelfIds: [...new Set((it.shelfNames ?? []).map(shelfIdFor))],
        source: 'import',
      };
      keys.forEach((k) => idByKey.set(k, book.id));
      bookIdFor.set(it.key, book.id);
      toAdd.push(book);
    }

    const noteKey = (bookId: string, text: string) => `${bookId}|${text.trim()}`;
    const seenNotes = new Set(state.notes.map((n) => noteKey(n.bookId, n.text)));
    const notes: BookNote[] = [];
    for (const n of bundle.notes) {
      const bookId = bookIdFor.get(n.bookKey);
      if (!bookId || !n.text.trim() || seenNotes.has(noteKey(bookId, n.text))) continue;
      seenNotes.add(noteKey(bookId, n.text));
      notes.push({ id: uid('n_'), bookId, type: n.type, text: n.text.trim(), page: n.page, createdAt: n.createdAt });
    }
    const sessionKey = (bookId: string, t: number) => `${bookId}|${t}`;
    const seenSessions = new Set(state.sessions.map((x) => sessionKey(x.bookId, x.startTime)));
    const sessions: ReadingSession[] = [];
    for (const x of bundle.sessions) {
      const bookId = bookIdFor.get(x.bookKey);
      if (!bookId || seenSessions.has(sessionKey(bookId, x.startTime))) continue;
      seenSessions.add(sessionKey(bookId, x.startTime));
      sessions.push({
        id: uid('s_'),
        bookId,
        startTime: x.startTime,
        endTime: x.endTime,
        durationSeconds: Math.max(0, Math.round(x.durationSeconds)),
        startPage: x.startPage,
        endPage: x.endPage,
        pagesRead: Math.max(0, Math.round(x.pagesRead)),
        date: readingDayKey(x.startTime || x.endTime),
      });
    }

    set((s) => ({
      books: [...toAdd, ...s.books],
      shelves: [...s.shelves, ...newShelves],
      notes: [...notes, ...s.notes],
      sessions: [...sessions, ...s.sessions],
    }));
    persist(get);
    return { added: toAdd.length, matched, notes: notes.length, sessions: sessions.length, addedIds: toAdd.map((b) => b.id) };
  },

  updateBook: (id, patch) => {
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? applyBookPatch(b, patch) : b)),
    }));
    persist(get);
  },

  // Apply many book patches in a single state update + persist (used by
  // background enrichment so it doesn't rewrite the whole DB once per book).
  // `onlyIf` is evaluated against the book's *current* state at apply time,
  // so a slow background job can't overwrite what the user edited meanwhile.
  updateBooks: (patches, onlyIf) => {
    if (patches.length === 0) return;
    const map = new Map(patches.map((p) => [p.id, p.patch]));
    set((s) => ({
      books: s.books.map((b) => {
        const patch = map.get(b.id);
        if (!patch || (onlyIf && !onlyIf(b))) return b;
        return applyBookPatch(b, patch);
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
    set((st) => {
      // Shelves may have been deleted during the undo window: drop dangling
      // ids rather than resurrecting references to shelves that no longer exist.
      const shelfIds = new Set(st.shelves.map((sh) => sh.id));
      const existing = new Set(st.books.map((b) => b.id));
      const restored = books
        .filter((b) => !existing.has(b.id))
        .map((b) => ({ ...b, shelfIds: b.shelfIds.filter((id) => shelfIds.has(id)) }));
      const restoredIds = new Set(restored.map((b) => b.id));
      return {
        books: [...restored, ...st.books],
        sessions: [...sessions.filter((x) => restoredIds.has(x.bookId)), ...st.sessions],
        notes: [...notes.filter((x) => restoredIds.has(x.bookId)), ...st.notes],
      };
    });
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
        // Giving up or shelving it again ends the reading plan.
        if (status === 'dnf' || status === 'want_to_read') patch.plan = undefined;
        if (status === 'finished') {
          // A normal status correction must not count as a re-read. Only
          // startReread clears finishedAt, which marks a genuinely new cycle.
          // A book that already counted as read (e.g. imported "read" with no
          // date) keeps its count and gets no invented finish date.
          Object.assign(patch, finishFields(b, Date.now()));
          if (b.pageCount) patch.currentPage = b.pageCount;
        }
        return { ...b, ...patch };
      }),
    }));
    persist(get);
  },

  setProgress: (id, currentPage) => {
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? applyProgress(b, currentPage) : b)),
    }));
    persist(get);
  },

  setRating: (id, rating) => {
    get().updateBook(id, { rating });
  },

  // Start a fresh read cycle on a finished book: the current finish is banked
  // into the read history (so past years' stats keep it), then back to
  // "reading" from page 0. readCount is preserved and gets bumped again when
  // this cycle reaches the end (via setProgress/setStatus).
  startReread: (id) => {
    const now = Date.now();
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? withRereadStarted(b, now) : b)),
    }));
    persist(get);
  },

  setReadDates: (id, patch) => {
    set((s) => ({
      books: s.books.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b };
        if (patch.startedAt !== undefined) next.startedAt = patch.startedAt ?? undefined;
        if (patch.finishedAt !== undefined) next.finishedAt = patch.finishedAt ?? undefined;
        // Consumers assume the history is ascending and free of duplicates.
        if (patch.reads !== undefined) next.reads = sanitizeReads(patch.reads);
        // A finish can't precede its start.
        if (next.startedAt != null && next.finishedAt != null && next.finishedAt < next.startedAt) {
          next.startedAt = next.finishedAt;
        }
        return next;
      }),
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
      // The reading day it started on: an evening session running past
      // midnight stays on the evening's day. Informational only - every day
      // bucket is recomputed with sessionDay(), so the day start hour can
      // change without rewriting sessions.
      date: readingDayKey(input.startTime),
    };
    // One update for the session and the book it advances: a second set would
    // re-render every subscriber (and re-run stampChanges) twice.
    set((s) => {
      const sessions = [session, ...s.sessions];
      // advance reading progress if the session recorded an end page - but only
      // ever forward, so a mistyped lower "to page" can't regress the book.
      const endPage = input.endPage;
      if (endPage == null) return { sessions };
      return {
        sessions,
        books: s.books.map((b) =>
          b.id === input.bookId ? applyProgress(b, Math.max(b.currentPage, endPage)) : b
        ),
      };
    });
    persist(get);
    return session;
  },

  updateSession: (id, patch) => {
    set((s) => {
      let bookId: string | undefined;
      const sessions = s.sessions.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        // Keep the stored day in sync with the (possibly edited) start time,
        // matching addSession.
        if (patch.startTime != null) next.date = sessionDay({ startTime: next.startTime, date: next.date });
        if (bookId === undefined) bookId = next.bookId;
        return next;
      });
      // keep book progress in sync if the end page changed (forward only),
      // in the same update as the session
      const endPage = patch.endPage;
      if (bookId == null || endPage == null) return { sessions };
      return {
        sessions,
        books: s.books.map((b) =>
          b.id === bookId ? applyProgress(b, Math.max(b.currentPage, endPage)) : b
        ),
      };
    });
    persist(get);
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
    const removed = get().notes.find((n) => n.id === id);
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    persist(get);
    return removed;
  },

  restoreNote: (note) => {
    set((s) => {
      if (s.notes.some((n) => n.id === note.id)) return s;
      if (!s.books.some((b) => b.id === note.bookId)) return s; // book gone meanwhile
      return { notes: [note, ...s.notes] };
    });
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
      // Only the books on that shelf change (a new object stamps updatedAt,
      // which would make every book win the next backup merge).
      books: s.books.map((b) => (b.shelfIds.includes(id) ? { ...b, shelfIds: b.shelfIds.filter((x) => x !== id) } : b)),
    }));
    persist(get);
  },

  saveGoal: (input) => {
    const custom = input.period === 'custom';
    const existing = input.id
      ? get().goals.find((g) => g.id === input.id)
      : custom
      ? undefined
      : get().goals.find((g) => g.metric === input.metric && g.period === input.period);
    const goal: Goal = {
      id: existing?.id ?? uid('g_'),
      metric: input.metric,
      period: input.period,
      target: Math.max(1, Math.round(input.target)),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    if (custom) {
      goal.start = input.start;
      goal.end = input.end;
      if (input.name?.trim()) goal.name = input.name.trim();
    }
    // Written for older app versions reading a backup: they know only these
    // three kinds, and "books per year" only for the year it names.
    const type = legacyTypeOf(goal.metric, goal.period);
    if (type) {
      goal.type = type;
      goal.year = new Date().getFullYear();
    }
    set((s) => ({
      goals: existing ? s.goals.map((g) => (g.id === existing.id ? goal : g)) : [...s.goals, goal],
    }));
    persist(get);
    return goal;
  },

  deleteGoal: (id) => {
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
    persist(get);
  },
  };
});

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
  const ik = isbnKey(b.isbn);
  return books.find((x) => {
    const xk = isbnKey(x.isbn);
    if (ik && xk === ik) return true;
    // Same title and author but a different ISBN: another edition.
    if (ik && xk && ik !== xk) return false;
    return (
      `${x.title.trim().toLowerCase()}|${(x.authors[0] ?? '').trim().toLowerCase()}` === titleKey
    );
  });
}
