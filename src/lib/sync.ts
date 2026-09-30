// Change tracking and backup merging. Pure (type-only app imports) so the
// check scripts run it under plain Node.
//
// Every book/session/note/shelf/goal carries `updatedAt`, stamped centrally by
// the store (stampChanges) whenever an item's object identity changes, and a
// deletion leaves a tombstone. A merge can then keep the newer copy of each
// item and never resurrect something that was deleted after the backup.
import type { AppData, Book, BookNote, Goal, ReadingSession, Shelf, Tombstone } from '@/types';
import { isbnKey } from './isbn.ts';

export const TRACKED = ['books', 'sessions', 'notes', 'shelves', 'goals'] as const;
type Tracked = (typeof TRACKED)[number];
type Item = { id: string; updatedAt?: number };

/** Tombstones older than this are dropped - no backup worth merging is that
 *  stale, and the list would otherwise grow forever. */
export const TOMBSTONE_TTL_MS = 2 * 365 * 86_400_000;
export const MAX_TOMBSTONES = 20000;

export function pruneTombstones(list: Tombstone[], now: number): Tombstone[] {
  let out = list.filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS);
  if (out.length > MAX_TOMBSTONES) {
    out = out.slice().sort((a, b) => b.deletedAt - a.deletedAt).slice(0, MAX_TOMBSTONES);
  }
  return out;
}

// Collection arrays (as returned by stampChanges) known to hold no duplicate
// ids. Only for those can the fast paths below reason by position alone: the
// general path matches by id, where a duplicate would behave differently.
const uniqueIds = new WeakSet<object>();

/** Most mutations prepend a few items, patch items in place or drop some -
 *  all detectable by object identity in one pass, without building id maps
 *  over the whole collection (20k sessions on every save). Produces exactly
 *  what the general path would; null when the change isn't one of these. */
function diffFast(
  before: Item[],
  next: Item[],
  now: number
): { stamped: Item[]; gone: Item[]; backItems: Item[] } | null {
  if (!uniqueIds.has(before)) return null;
  const n = before.length;
  const k = next.length - n;
  // Prepend: the old collection intact behind k new items.
  if (k > 0 && k <= 8) {
    let tail = true;
    for (let i = 0; i < n; i++) {
      if (next[k + i] !== before[i]) {
        tail = false;
        break;
      }
    }
    if (tail) {
      const fresh = next.slice(0, k);
      for (let i = 0; i < k; i++) {
        const id = fresh[i].id;
        for (let j = 0; j < i; j++) if (fresh[j].id === id) return null;
        for (let j = 0; j < n; j++) if (before[j].id === id) return null;
      }
      const stamped = next.slice();
      for (let i = 0; i < k; i++) {
        const x = fresh[i];
        stamped[i] = { ...x, updatedAt: Math.max(now, (x.updatedAt ?? 0) + 1) };
      }
      return { stamped, gone: [], backItems: fresh };
    }
  }
  // Same items in the same order, some replaced (a map() patch).
  if (k === 0) {
    const stamped = new Array<Item>(n);
    for (let i = 0; i < n; i++) {
      const x = next[i];
      const b = before[i];
      if (x === b) stamped[i] = x;
      else if (x.id === b.id) stamped[i] = { ...x, updatedAt: Math.max(now, (b.updatedAt ?? x.updatedAt ?? 0) + 1) };
      else return null;
    }
    return { stamped, gone: [], backItems: [] };
  }
  // Some items removed, the rest untouched and in order (a filter()).
  if (k < 0) {
    const gone: Item[] = [];
    let j = 0;
    for (const x of next) {
      while (j < n && before[j] !== x) gone.push(before[j++]);
      if (j === n) return null;
      j++;
    }
    while (j < n) gone.push(before[j++]);
    return { stamped: next.slice(), gone, backItems: [] };
  }
  return null;
}

/**
 * Given the state before a mutation and the patch it produced, stamp
 * `updatedAt` on every item whose object changed or appeared, and record a
 * tombstone for every item that disappeared. Items that come back (undo)
 * lose their tombstone. Collections not in the patch are untouched.
 */
export function stampChanges<S extends AppData>(prev: S, patch: Partial<S>, now: number = Date.now()): Partial<S> {
  let deleted: Tombstone[] | null = null;
  const out: Partial<S> = { ...patch };
  for (const coll of TRACKED) {
    const next = patch[coll] as Item[] | undefined;
    const before = prev[coll] as Item[];
    if (!next || next === before) continue;
    let diff = diffFast(before, next, now);
    if (!diff) {
      const prevById = new Map(before.map((x) => [x.id, x]));
      const nextIds = new Set<string>();
      const stamped = next.map((x) => {
        nextIds.add(x.id);
        const before = prevById.get(x.id);
        if (before === x) return x;
        // Never go back in time (a clock set back, an item from the future):
        // an edit must always be the newest version of that item.
        return { ...x, updatedAt: Math.max(now, (before?.updatedAt ?? x.updatedAt ?? 0) + 1) };
      });
      if (nextIds.size === stamped.length) uniqueIds.add(stamped);
      diff = {
        stamped,
        gone: before.filter((x) => !nextIds.has(x.id)),
        backItems: next.filter((x) => !prevById.has(x.id)),
      };
    } else {
      // Unique before, and the fast paths neither add a known id nor repeat one.
      uniqueIds.add(diff.stamped);
    }
    const { stamped, gone, backItems } = diff;
    (out as Record<Tracked, unknown>)[coll] = stamped;
    const current: Tombstone[] = deleted ?? (patch.deleted as Tombstone[] | undefined) ?? prev.deleted ?? [];
    const back = new Set(backItems.map((x) => x.id));
    // A book added again (undo, or re-added by hand) also clears the key
    // tombstones of its earlier copy - not those of a different edition.
    // key -> ISBN keys of the re-added books holding it ('' = no ISBN)
    const backKeys = new Map<string, string[]>();
    if (coll === 'books') {
      for (const x of backItems) {
        const keys = bookKeys(x as unknown as Book);
        const ik = isbnKeyOf(keys) ?? '';
        for (const k of keys) {
          const list = backKeys.get(k);
          if (list) list.push(ik);
          else backKeys.set(k, [ik]);
        }
      }
    }
    const revives = (t: Tombstone) =>
      back.has(t.id) || (t.keys ?? []).some((k) => backKeys.get(k)?.some((ik) => keyApplies(t, k, ik || undefined)));
    const revived = current.some(revives);
    if (gone.length || revived) {
      const list = current.filter((t) => !revives(t));
      // A key another book still holds (a duplicate copy, the same title in
      // another edition) must not go into the tombstone: a merge would take
      // it as the deletion of that surviving book.
      let liveKeys: Set<string> | null = null;
      for (const x of gone) {
        if (coll !== 'books') {
          list.push({ id: x.id, deletedAt: now });
          continue;
        }
        if (!liveKeys) liveKeys = new Set(stamped.flatMap((b) => bookKeys(b as unknown as Book)));
        const live = liveKeys;
        const keys = bookKeys(x as unknown as Book).filter((k) => !live.has(k));
        list.push(keys.length ? { id: x.id, deletedAt: now, keys } : { id: x.id, deletedAt: now });
      }
      deleted = list;
    }
  }
  if (deleted) (out as Partial<AppData>).deleted = pruneTombstones(deleted, now);
  return out;
}

// --- Merge ------------------------------------------------------------------

export interface MergeSummary {
  booksAdded: number;
  booksUpdated: number;
  sessionsAdded: number;
  notesAdded: number;
  shelvesAdded: number;
  goalsAdded: number;
  /** items present in the backup but dropped because they were deleted here
   *  later (or vice versa) */
  removed: number;
}

export interface MergeResult {
  data: AppData;
  summary: MergeSummary;
  /** cover URLs referenced before the merge but by no book after it (local
   *  files the caller can delete) */
  orphanedCovers: string[];
}

const ts = (x: Item) => x.updatedAt ?? 0;

function mergeCollection<T extends Item>(
  local: T[],
  incoming: T[],
  keyOf: (x: T) => string | undefined,
  remap: (x: T) => T | null
): { items: T[]; idMap: Map<string, string>; added: number; updated: number } {
  const items = local.slice();
  const index = new Map<string, number>(); // id -> position
  // Natural keys of local items only: two distinct items of the backup must
  // never collapse into one because they share a key, and a local item whose
  // own id is in the backup is matched by that id, not by another's key.
  const incomingIds = new Set(incoming.map((x) => x.id));
  const byKey = new Map<string, number>();
  items.forEach((x, i) => {
    index.set(x.id, i);
    const k = keyOf(x);
    if (k && !byKey.has(k) && !incomingIds.has(x.id)) byKey.set(k, i);
  });
  const idMap = new Map<string, string>();
  let added = 0;
  let updated = 0;
  for (const raw of incoming) {
    const inc = remap(raw);
    if (!inc) continue;
    const k = keyOf(inc);
    const pos = index.get(inc.id) ?? (k ? byKey.get(k) : undefined);
    if (pos != null) {
      const cur = items[pos];
      idMap.set(raw.id, cur.id);
      // Tie goes to this device: an unchanged backup must be a no-op.
      if (ts(inc) > ts(cur)) {
        items[pos] = { ...inc, id: cur.id };
        updated++;
      }
      continue;
    }
    idMap.set(raw.id, inc.id);
    index.set(inc.id, items.length);
    items.push(inc);
    added++;
  }
  return { items, idMap, added, updated };
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

const isbnKeyOf = (keys: readonly string[]) => keys.find((k) => k.startsWith('isbn:'));

/** Whether tombstone `t`'s `key` reaches a book whose ISBN key is `bookIsbn`.
 *  The edition rule of book matching: a title|author key never reaches a
 *  book with a different known ISBN than the deleted one. */
function keyApplies(t: Tombstone, key: string, bookIsbn: string | undefined): boolean {
  if (!key.startsWith('t:') || !bookIsbn) return true;
  const deletedIsbn = t.keys ? isbnKeyOf(t.keys) : undefined;
  return !deletedIsbn || deletedIsbn === bookIsbn;
}

/** Same identity rule the add flows and the CSV import use. */
export function bookKeys(b: Book): string[] {
  const keys = [`t:${norm(b.title)}|${norm(b.authors[0])}`];
  const ik = isbnKey(b.isbn);
  if (ik) keys.unshift(`isbn:${ik}`);
  return keys;
}

/**
 * Merge a backup into the current library. Items are matched by id, then by
 * a natural key (ISBN or title+author for books, name for shelves, …) so a
 * backup from a reinstall with fresh ids doesn't duplicate everything. On a
 * match the more recently changed copy wins; deletions recorded on either
 * side win over copies older than the deletion.
 */
export function mergeData(local: AppData, incoming: AppData, now: number = Date.now()): MergeResult {
  // Tombstones: union, latest deletion per id.
  const tomb = new Map<string, number>();
  const mergedTombs = new Map<string, Tombstone>();
  // Key tombstones by origin (key -> tombstones carrying it): each side's
  // deletions only reach books the other side brings - see bookAlive.
  const localByKey = new Map<string, Tombstone[]>();
  const incomingByKey = new Map<string, Tombstone[]>();
  const collect = (list: Tombstone[], byKey: Map<string, Tombstone[]>) => {
    for (const raw of list) {
      const t = { ...raw, deletedAt: Math.min(raw.deletedAt, now) }; // no deletions "from the future"
      tomb.set(t.id, Math.max(tomb.get(t.id) ?? 0, t.deletedAt));
      for (const k of t.keys ?? []) {
        const at = byKey.get(k);
        if (at) at.push(t);
        else byKey.set(k, [t]);
      }
      const prev = mergedTombs.get(t.id);
      mergedTombs.set(t.id, { id: t.id, deletedAt: Math.max(prev?.deletedAt ?? 0, t.deletedAt), ...(t.keys || prev?.keys ? { keys: t.keys ?? prev?.keys } : {}) });
    }
  };
  collect(local.deleted ?? [], localByKey);
  collect(incoming.deleted ?? [], incomingByKey);
  const alive = <T extends Item>(x: T) => {
    const d = tomb.get(x.id);
    return d == null || ts(x) > d;
  };

  const shelves = mergeCollection<Shelf>(local.shelves, incoming.shelves, (s) => `n:${norm(s.name)}`, (s) => s);

  // Books match on any of their keys (ISBN first, then title|author) - keys
  // of local books only, and not of one whose own id is in the backup (the
  // same rules as mergeCollection).
  const localBooks = local.books.slice();
  const keyToPos = new Map<string, number>();
  const idToPos = new Map<string, number>();
  const incomingBookIds = new Set(incoming.books.map((b) => b.id));
  localBooks.forEach((b, i) => {
    idToPos.set(b.id, i);
    if (incomingBookIds.has(b.id)) return;
    for (const k of bookKeys(b)) if (!keyToPos.has(k)) keyToPos.set(k, i);
  });
  // local books some backup book matched (by id or key)
  const matchedLocal = new Set<string>();
  // Two editions with different ISBNs are different books, even when title
  // and author match.
  const sameBook = (a: Book, b: Book) => {
    const ia = isbnKey(a.isbn);
    const ib = isbnKey(b.isbn);
    return !ia || !ib || ia === ib;
  };
  const bookMap = new Map<string, string>();
  for (const raw of incoming.books) {
    const inc: Book = {
      ...raw,
      shelfIds: raw.shelfIds.map((id) => shelves.idMap.get(id)).filter((id): id is string => !!id),
    };
    let pos = idToPos.get(inc.id);
    if (pos == null) {
      for (const k of bookKeys(inc)) {
        const p = keyToPos.get(k);
        if (p != null && sameBook(localBooks[p], inc)) {
          pos = p;
          break;
        }
      }
    }
    if (pos != null) {
      const cur = localBooks[pos];
      bookMap.set(raw.id, cur.id);
      matchedLocal.add(cur.id);
      if (ts(inc) > ts(cur)) {
        localBooks[pos] = { ...inc, id: cur.id };
      }
      continue;
    }
    bookMap.set(raw.id, inc.id);
    idToPos.set(inc.id, localBooks.length);
    localBooks.push(inc);
  }

  const localIds = new Set(local.books.map((b) => b.id));
  // A deletion made on another device also reaches the same book here under
  // a different id (matched by ISBN or title+author) - but only a book it
  // could have meant: a backup's key tombstones reach local books the backup
  // has no copy of, this device's reach books that come only from the
  // backup. A book kept on the side that recorded the deletion (a duplicate
  // copy, another edition) is never taken for the deleted one.
  const bookAlive = (b: Book) => {
    if (!alive(b)) return false;
    const byKey = localIds.has(b.id) ? (matchedLocal.has(b.id) ? null : incomingByKey) : localByKey;
    if (!byKey) return true;
    const keys = bookKeys(b);
    const ik = isbnKeyOf(keys);
    return keys.every((k) => (byKey.get(k) ?? []).every((t) => !keyApplies(t, k, ik) || ts(b) > t.deletedAt));
  };

  const remapBookRef = <T extends { bookId: string }>(x: T): T | null => {
    const bookId = bookMap.get(x.bookId);
    return bookId ? { ...x, bookId } : null;
  };
  const sessions = mergeCollection<ReadingSession>(
    local.sessions,
    incoming.sessions,
    // Everything that tells two sessions apart: manual ones share a nominal
    // noon start, so bookId|startTime alone would merge a day's sessions.
    (s) => `${s.bookId}|${s.startTime}|${s.endTime}|${s.durationSeconds}|${s.pagesRead}|${s.endPage ?? ''}`,
    remapBookRef
  );
  const notes = mergeCollection<BookNote>(
    local.notes,
    incoming.notes,
    (n) => `${n.bookId}|${n.type}|${n.text.trim()}`,
    remapBookRef
  );
  const goals = mergeCollection<Goal>(
    local.goals,
    incoming.goals,
    (g) => (g.period === 'custom' ? `c:${norm(g.name)}|${g.start}|${g.end}|${g.metric}` : `r:${g.metric}|${g.period}`),
    (g) => g
  );

  // Apply deletions, then drop anything left pointing at a missing parent.
  let removed = 0;
  const keep = <T extends Item>(list: T[]) =>
    list.filter((x) => {
      const ok = alive(x);
      if (!ok) removed++;
      return ok;
    });
  const booksOut = localBooks.filter((b) => {
    const ok = bookAlive(b);
    if (!ok) removed++;
    return ok;
  });
  const bookIds = new Set(booksOut.map((b) => b.id));
  const shelvesOut = keep(shelves.items);
  const shelfIds = new Set(shelvesOut.map((s) => s.id));
  // New books first, like any add; existing books keep their order.
  const orderedBooks = [
    ...booksOut.filter((b) => !localIds.has(b.id)),
    ...booksOut.filter((b) => localIds.has(b.id)),
  ].map((b) => (b.shelfIds.every((id) => shelfIds.has(id)) ? b : { ...b, shelfIds: b.shelfIds.filter((id) => shelfIds.has(id)) }));

  const data: AppData = {
    books: orderedBooks,
    sessions: keep(sessions.items).filter((s) => bookIds.has(s.bookId)),
    notes: keep(notes.items).filter((n) => bookIds.has(n.bookId)),
    shelves: shelvesOut,
    goals: keep(goals.items),
    deleted: pruneTombstones([...mergedTombs.values()], now),
    version: Math.max(local.version, incoming.version),
  };

  const before = new Set<string>();
  for (const b of [...local.books, ...incoming.books]) if (b.coverUrl) before.add(b.coverUrl);
  for (const b of data.books) if (b.coverUrl) before.delete(b.coverUrl);

  // Count what actually survived the deletions (an item added from the
  // backup and then dropped by a tombstone was never really added).
  const added = <T extends Item>(out: T[], before: T[]) => {
    const ids = new Set(before.map((x) => x.id));
    return out.filter((x) => !ids.has(x.id)).length;
  };
  const localById = new Map<string, Book>();
  for (const b of local.books) if (!localById.has(b.id)) localById.set(b.id, b); // first wins, like find()
  const updatedBooks = data.books.filter((b) => {
    const prev = localById.get(b.id);
    return prev && prev !== b && ts(b) > ts(prev);
  }).length;
  return {
    data,
    summary: {
      booksAdded: added(data.books, local.books),
      booksUpdated: updatedBooks,
      sessionsAdded: added(data.sessions, local.sessions),
      notesAdded: added(data.notes, local.notes),
      shelvesAdded: added(data.shelves, local.shelves),
      goalsAdded: added(data.goals, local.goals),
      removed,
    },
    orphanedCovers: [...before],
  };
}
