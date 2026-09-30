import assert from 'node:assert/strict';
import { stampChanges, mergeData, TOMBSTONE_TTL_MS } from '../../src/lib/sync.ts';

const B = (id: string, extra: any = {}): any => ({ id, title: `T ${id}`, authors: ['A'], status: 'reading', currentPage: 0, addedAt: 1, shelfIds: [], source: 'manual', ...extra });
const empty: any = { books: [], sessions: [], notes: [], shelves: [], goals: [], deleted: [], version: 1 };

// stamping: only changed/new items get updatedAt, removals leave tombstones, undo clears them
{
  const a = B('a'), b = B('b');
  const prev: any = { ...empty, books: [a, b] };
  const out: any = stampChanges(prev, { books: [a, { ...b, currentPage: 5 }, B('c')] }, 100);
  assert.equal(out.books[0], a); assert.equal(out.books[1].updatedAt, 100); assert.equal(out.books[2].updatedAt, 100);
  assert.equal(out.deleted, undefined);
  const del: any = stampChanges(prev, { books: [a] }, 200);
  assert.deepEqual(del.deleted, [{ id: 'b', deletedAt: 200, keys: ['t:t b|a'] }]);
  const undo: any = stampChanges({ ...prev, books: [a], deleted: del.deleted }, { books: [a, b] }, 300);
  assert.deepEqual(undo.deleted, []);
  assert.deepEqual(stampChanges(prev, { goals: [] } as any, 1), { goals: [] }, 'same-length untouched collections pass through');
  const old: any = stampChanges({ ...prev, deleted: [{ id: 'z', deletedAt: 0 }] }, { books: [a] }, TOMBSTONE_TTL_MS + 10);
  assert.deepEqual(old.deleted.map((t: any) => t.id), ['b'], 'expired tombstones pruned');
}

// merge: identical backup is a no-op
{
  const local: any = { ...empty, books: [B('a', { updatedAt: 5 })], sessions: [{ id: 's', bookId: 'a', startTime: 1, endTime: 2, durationSeconds: 1, pagesRead: 1, date: '2026-01-01' }] };
  const r = mergeData(local, structuredClone(local));
  assert.deepEqual(r.data.books, local.books); assert.equal(r.data.sessions.length, 1);
  assert.deepEqual(r.summary, { booksAdded: 0, booksUpdated: 0, sessionsAdded: 0, notesAdded: 0, shelvesAdded: 0, goalsAdded: 0, removed: 0 });
}

// merge: newer wins, new items added, ISBN/title matching remaps children, shelves by name
{
  const local: any = { ...empty,
    shelves: [{ id: 'sh1', name: 'Preferiti', color: '#f00', createdAt: 1 }],
    books: [B('a', { updatedAt: 10, currentPage: 10 }), B('x', { isbn: '9788807031281', updatedAt: 50 })],
  };
  const incoming: any = { ...empty,
    shelves: [{ id: 'shX', name: 'preferiti ', color: '#0f0', createdAt: 1 }, { id: 'shY', name: 'Nuovo', color: '#00f', createdAt: 1 }],
    books: [
      B('a', { updatedAt: 20, currentPage: 99, shelfIds: ['shX'] }),
      B('other-id', { title: 'different title', isbn: '88-07-03128-0', updatedAt: 10, shelfIds: ['shY'] }),
      B('n', { title: 'Nuovo libro', shelfIds: ['shY'] }),
    ],
    sessions: [{ id: 's2', bookId: 'other-id', startTime: 5, endTime: 6, durationSeconds: 60, pagesRead: 3, date: '2026-01-02' }],
    notes: [{ id: 'n1', bookId: 'n', type: 'quote', text: 'ciao', createdAt: 1 }],
  };
  const r = mergeData(local, incoming);
  const a = r.data.books.find((b) => b.id === 'a')!;
  assert.equal(a.currentPage, 99); assert.deepEqual(a.shelfIds, ['sh1']);
  const x = r.data.books.find((b) => b.id === 'x')!;
  assert.equal(x.title, 'T x', 'local newer copy kept');
  assert.equal(r.data.sessions[0].bookId, 'x', 'session remapped to the matched local book');
  assert.equal(r.data.books[0].id, 'n', 'new books first');
  assert.equal(r.data.books[0].shelfIds.length, 1);
  assert.equal(r.data.shelves.length, 2);
  assert.equal(r.summary.booksAdded, 1); assert.equal(r.summary.booksUpdated, 1); assert.equal(r.summary.shelvesAdded, 1);
  assert.equal(r.data.notes[0].bookId, 'n');
}

// merge: deletions win over older copies but not over newer edits; children dropped
{
  const local: any = { ...empty, books: [B('keep')], deleted: [{ id: 'gone', deletedAt: 100 }, { id: 'edited', deletedAt: 100 }] };
  const incoming: any = { ...empty,
    books: [B('gone', { updatedAt: 50 }), B('edited', { title: 'E', updatedAt: 150 })],
    notes: [{ id: 'n', bookId: 'gone', type: 'note', text: 'x', createdAt: 1 }],
  };
  const r = mergeData(local, incoming);
  assert.deepEqual(r.data.books.map((b) => b.id).sort(), ['edited', 'keep']);
  assert.equal(r.data.notes.length, 0); assert.equal(r.summary.removed, 1);
  // and the other direction: the backup knows a deletion this device doesn't
  const r2 = mergeData({ ...empty, books: [B('k', { updatedAt: 1 })] }, { ...empty, deleted: [{ id: 'k', deletedAt: 5 }] });
  assert.equal(r2.data.books.length, 0);
}

// orphaned covers reported
{
  const r = mergeData({ ...empty, books: [B('a', { coverUrl: 'file:///old.jpg', updatedAt: 1 })] }, { ...empty, books: [B('a', { coverUrl: 'file:///new.jpg', updatedAt: 2 })] });
  assert.deepEqual(r.orphanedCovers, ['file:///old.jpg']);
}
console.log('sync: all assertions passed');
// summary counts only what survives deletions
{
  const r = mergeData({ ...empty, books: [B('keep')], deleted: [{ id: 'gone', deletedAt: 100 }] } as any, { ...empty, books: [B('gone', { updatedAt: 50 }), B('new')] } as any);
  assert.equal(r.summary.booksAdded, 1); assert.equal(r.summary.removed, 1);
}
console.log('sync (summary): all assertions passed');

// regressions from the data audit
{
  // a deletion reaches the same book under another id (matched by title/ISBN)
  const local: any = { ...empty, books: [B('a1', { title: 'Dune', updatedAt: 10 })] };
  const incoming: any = { ...empty, deleted: [{ id: 'b1', deletedAt: 50, keys: ['t:dune|a'] }] };
  assert.equal(mergeData(local, incoming).data.books.length, 0);
  // …but not a copy edited after the deletion
  assert.equal(mergeData({ ...empty, books: [B('a1', { title: 'Dune', updatedAt: 99 })] } as any, incoming).data.books.length, 1);
  // different editions (ISBNs differ) stay separate books
  const r = mergeData(
    { ...empty, books: [B('l', { title: 'X', isbn: '9788807031281', rating: 5, status: 'finished', updatedAt: 1 })] } as any,
    { ...empty, books: [B('r', { title: 'X', isbn: '9788804668237', updatedAt: 9 })] } as any
  );
  assert.equal(r.data.books.length, 2); assert.equal(r.data.books.find((b: any) => b.id === 'l').rating, 5);
  // a tombstone from the far future is clamped and doesn't outlive the TTL forever
  const fut = mergeData({ ...empty, books: [B('k', { updatedAt: 5 })] } as any, { ...empty, deleted: [{ id: 'k', deletedAt: 8.64e15 }] } as any, 1000);
  assert.ok(fut.data.deleted[0].deletedAt <= 1000 + 86_400_000);
  // an edit is always newer than the stored version, even with a clock set back
  const prev: any = { ...empty, books: [B('z', { updatedAt: 9e12 })] };
  const out: any = stampChanges(prev, { books: [{ ...prev.books[0], currentPage: 3 }] }, 100);
  assert.ok(out.books[0].updatedAt > 9e12);
  // re-adding a deleted book clears its key tombstone
  const del2: any = stampChanges({ ...empty, books: [B('q', { title: 'Q' })] } as any, { books: [] } as any, 10);
  const back: any = stampChanges({ ...empty, books: [], deleted: del2.deleted } as any, { books: [B('q2', { title: 'Q' })] } as any, 20);
  assert.deepEqual(back.deleted, []);
}
console.log('sync (audit regressions): all assertions passed');

// ---- stampChanges fast paths (prepend / in-place patch / filter) ----
// A collection that came out of stampChanges is known to have unique ids and
// takes the positional fast paths; a fresh copy of the same array (unknown)
// takes the general id-matching path. Both must produce identical output.
{
  const S = (i: number, extra: any = {}): any => ({ id: `s${i}`, bookId: `b${i % 7}`, startTime: i, endTime: i + 1, durationSeconds: 60, pagesRead: 1, date: '2026-01-01', ...(i % 3 ? { updatedAt: i } : {}), ...extra });
  const base: any = { ...empty, books: Array.from({ length: 30 }, (_, i) => B(`b${i}`, i % 2 ? { updatedAt: 50 } : {})), sessions: Array.from({ length: 200 }, (_, i) => S(i)), notes: [] };
  // "known" state: every collection as stampChanges returned it
  const seed: any = stampChanges({ ...base, books: [], sessions: [] }, { books: base.books, sessions: base.sessions }, 10);
  const known: any = { ...base, ...seed };
  const fresh = (st: any): any => ({ ...st, books: st.books.slice(), sessions: st.sessions.slice(), notes: st.notes.slice() });
  // the fast path must not fall back to building id maps: make that throw
  const guard = (arr: any) => { arr.map = () => { throw new Error('slow path'); }; arr.filter = () => { throw new Error('slow path'); }; };
  const unguard = (arr: any) => { delete arr.map; delete arr.filter; };
  const same = (label: string, patchOf: (st: any) => any, now: number, fast = true) => {
    const slow = stampChanges(fresh(known), patchOf(known), now);
    const patch = patchOf(known);
    if (fast) { guard(known.books); guard(known.sessions); }
    try {
      assert.deepEqual(stampChanges(known, patch, now), slow, label);
    } finally { unguard(known.books); unguard(known.sessions); }
  };
  const newS = S(999, { updatedAt: 5000 });
  same('prepend one session', (st) => ({ sessions: [newS, ...st.sessions] }), 100);
  same('prepend three sessions', (st) => ({ sessions: [S(1001), S(1002), newS, ...st.sessions] }), 100);
  same('prepend a book (+ session patch)', (st) => ({ books: [B('new', { title: 'New' }), ...st.books], sessions: st.sessions.map((x: any, i: number) => (i === 4 ? { ...x, pagesRead: 9 } : x)) }), 100);
  same('in-place patch, clock behind', (st) => ({ books: st.books.map((b: any, i: number) => (i === 3 || i === 5 ? { ...b, rating: 4 } : b)) }), 1);
  same('filter delete', (st) => ({ books: st.books.filter((b: any) => b.id !== 'b2'), sessions: st.sessions.filter((x: any) => x.bookId !== 'b2') }), 300);
  same('filter delete tail', (st) => ({ sessions: st.sessions.slice(0, 150) }), 300);
  same('delete everything', (st) => ({ sessions: [] }), 300);
  // undo: the item comes back at the front and its tombstone (by id and by book key) goes
  const del: any = stampChanges(known, { books: known.books.filter((b: any) => b.id !== 'b4') }, 400);
  const afterDel: any = { ...known, ...del };
  {
    const slow = stampChanges(fresh(afterDel), { books: [known.books[4], ...afterDel.books] }, 500);
    const fast = stampChanges(afterDel, { books: [known.books[4], ...afterDel.books] }, 500);
    assert.deepEqual(fast, slow); assert.deepEqual((fast as any).deleted, []);
    const readd = stampChanges(afterDel, { books: [B('b4copy', { title: 'T b4' }), ...afterDel.books] }, 500);
    assert.deepEqual(readd, stampChanges(fresh(afterDel), { books: [B('b4copy', { title: 'T b4' }), ...afterDel.books] }, 500));
    assert.deepEqual((readd as any).deleted, [], 'key tombstone cleared by a re-added copy');
  }
  // not fast-path shaped: fall back to the general path, same result
  same('prepend an id that already exists', (st) => ({ sessions: [{ ...st.sessions[10], pagesRead: 7 }, ...st.sessions] }), 100, false);
  same('prepend a duplicate pair', (st) => ({ sessions: [S(2000), S(2000), ...st.sessions] }), 100, false);
  same('reorder', (st) => ({ books: [...st.books].reverse() }), 100, false);
  same('append', (st) => ({ books: [...st.books, B('z')] }), 100, false);
  same('replace one by another id', (st) => ({ books: st.books.map((b: any, i: number) => (i === 0 ? B('other') : b)) }), 100, false);
  // chained: the output of a fast path is itself known-unique
  const s1: any = { ...known, ...stampChanges(known, { sessions: [newS, ...known.sessions] }, 100) };
  guard(s1.sessions);
  try { assert.deepEqual(stampChanges(s1, { sessions: s1.sessions.slice(1) }, 200), stampChanges(fresh(s1), { sessions: s1.sessions.slice(1) }, 200)); } finally { unguard(s1.sessions); }
  // an array with duplicate ids is never treated as known
  const dup: any = { ...empty, sessions: [S(1), S(1, { pagesRead: 3 })] };
  const d1: any = stampChanges(dup, { sessions: [S(5), ...dup.sessions] }, 50);
  assert.deepEqual(stampChanges({ ...dup, ...d1 }, { sessions: [S(6), ...d1.sessions] }, 60), stampChanges({ ...dup, sessions: d1.sessions.slice() }, { sessions: [S(6), ...d1.sessions] }, 60));
}

// mergeData: the "updated" count looks up the first local copy of an id
{
  const local: any = { ...empty, books: [B('a', { updatedAt: 5 }), B('b', { updatedAt: 5 })] };
  const inc: any = { ...empty, books: [B('a', { updatedAt: 9, rating: 3 }), B('b', { updatedAt: 1 })] };
  assert.equal(mergeData(local, inc, 100).summary.booksUpdated, 1);
}
console.log('sync (fast paths): all assertions passed');

// ---- key tombstones and natural-key matching (data audit 2) ----
{
  const now = 1_000_000;
  // deleting one of two copies: the tombstone carries no key the kept copy holds
  const a = B('a', { title: 'Dune', updatedAt: 10 }), b = B('b', { title: 'Dune', updatedAt: 10 });
  const del: any = stampChanges({ ...empty, books: [a, b] }, { books: [a] }, now);
  assert.deepEqual(del.deleted, [{ id: 'b', deletedAt: now }]);
  const r1 = mergeData({ ...empty, books: del.books, sessions: [{ id: 's', bookId: 'a', startTime: 1, endTime: 2, durationSeconds: 60, pagesRead: 1, date: '2026-01-01' }], deleted: del.deleted }, { ...empty, books: [B('zzz', { title: 'Other' })] }, now + 1000);
  assert.deepEqual(r1.data.books.map((x: any) => x.id).sort(), ['a', 'zzz']); assert.equal(r1.data.sessions.length, 1);
  // deleting one edition keeps only its ISBN key while the other edition lives
  const e1 = B('e1', { title: 'X', isbn: '9788807031281', updatedAt: 10 }), e2 = B('e2', { title: 'X', isbn: '9788804668237', updatedAt: 10 });
  const delE: any = stampChanges({ ...empty, books: [e1, e2] }, { books: [e1] }, now);
  assert.deepEqual(delE.deleted[0].keys, ['isbn:9788804668237']);
  assert.deepEqual(mergeData({ ...empty, books: delE.books, deleted: delE.deleted }, { ...empty }, now + 1000).data.books.map((x: any) => x.id), ['e1']);
}
{
  const now = 1_000_000;
  // older tombstones may still carry a surviving book's keys: this device's
  // key tombstones never reach its own books, only books the backup brings
  const localTomb = { id: 'old', deletedAt: 500, keys: ['t:dune|a'] };
  const kept = B('k', { title: 'Dune', updatedAt: 10 });
  const r = mergeData({ ...empty, books: [kept], deleted: [localTomb] }, { ...empty, books: [B('fromBackup', { title: 'Dune', updatedAt: 10 }), B('kk', { title: 'Other' })] }, now);
  // the backup's Dune matched the local one by key (and is that book) - both survive as one
  assert.deepEqual(r.data.books.map((x: any) => x.id).sort(), ['k', 'kk']);
  // …and a backup-only copy older than this device's deletion is dropped
  const r2 = mergeData({ ...empty, books: [B('z', { title: 'Z' })], deleted: [localTomb] }, { ...empty, books: [B('fromBackup', { title: 'Dune', updatedAt: 10 })] }, now);
  assert.deepEqual(r2.data.books.map((x: any) => x.id), ['z']);
  // the backup's key tombstones don't reach a local book the backup itself has a copy of
  const r3 = mergeData({ ...empty, books: [B('k', { title: 'Dune', updatedAt: 10 })] }, { ...empty, books: [B('k', { title: 'Dune', updatedAt: 10 })], deleted: [{ id: 'dupe', deletedAt: 500, keys: ['t:dune|a'] }] }, now);
  assert.deepEqual(r3.data.books.map((x: any) => x.id), ['k']);
  // edition rule: a deleted edition's title key doesn't reach another edition…
  const edTomb = { id: 'ed1', deletedAt: 500, keys: ['isbn:9788807031281', 't:x|a'] };
  const r4 = mergeData({ ...empty, books: [B('ed2', { title: 'X', isbn: '9788804668237', updatedAt: 10 })] }, { ...empty, deleted: [edTomb] }, now);
  assert.deepEqual(r4.data.books.map((x: any) => x.id), ['ed2']);
  // …but does reach a copy without an ISBN
  const r5 = mergeData({ ...empty, books: [B('noisbn', { title: 'X', updatedAt: 10 })] }, { ...empty, deleted: [edTomb] }, now);
  assert.equal(r5.data.books.length, 0);
  // re-adding a different edition doesn't clear the deleted edition's tombstone; the same edition does
  const other: any = stampChanges({ ...empty, books: [], deleted: [edTomb] }, { books: [B('ed3', { title: 'X', isbn: '9788804668237' })] }, now);
  assert.equal(other.deleted, undefined, 'tombstones untouched');
  const same: any = stampChanges({ ...empty, books: [], deleted: [edTomb] }, { books: [B('ed4', { title: 'X', isbn: '9788807031281' })] }, now);
  assert.deepEqual(same.deleted, []);
  // deletions from the future are clamped to now
  const fut = mergeData({ ...empty }, { ...empty, deleted: [{ id: 'f', deletedAt: now + 5 * 86_400_000 }] }, now);
  assert.equal(fut.data.deleted[0].deletedAt, now);
}
{
  // two manual sessions of the same day (same nominal noon start) stay two
  const noon = new Date(2026, 8, 1, 12).getTime();
  const s1 = { id: 's1', bookId: 'bk', startTime: noon, endTime: noon + 1800e3, durationSeconds: 1800, pagesRead: 20, date: '2026-09-01', updatedAt: 5 };
  const s2 = { ...s1, id: 's2', pagesRead: 30, durationSeconds: 600, endTime: noon + 600e3, updatedAt: 6 };
  const r = mergeData({ ...empty, books: [B('other')] }, { ...empty, books: [B('bk', { updatedAt: 5 })], sessions: [s1, s2] });
  assert.deepEqual(r.data.sessions.map((s: any) => s.id), ['s1', 's2']); assert.equal(r.summary.sessionsAdded, 2);
  // …while the same session under a fresh id (a reinstall's backup) still matches
  const r2 = mergeData({ ...empty, books: [B('bk', { updatedAt: 5 })], sessions: [s1] }, { ...empty, books: [B('bk2', { title: 'T bk', updatedAt: 5 })], sessions: [{ ...s1, id: 'fresh', bookId: 'bk2' }] });
  assert.equal(r2.data.sessions.length, 1); assert.equal(r2.summary.sessionsAdded, 0);
  // two different backup books with the same title and author stay two
  const r3 = mergeData({ ...empty, books: [B('o', { updatedAt: 1 })] }, { ...empty, books: [B('p1', { title: 'Poems', rating: 5, updatedAt: 3 }), B('p2', { title: 'Poems', rating: 1, updatedAt: 4 })] });
  assert.deepEqual(r3.data.books.map((b: any) => `${b.id}:${b.rating}`), ['p1:5', 'p2:1', 'o:undefined']);
  // a local book whose own id is in the backup isn't key-matched by another backup book
  const r4 = mergeData({ ...empty, books: [B('x', { title: 'Same', updatedAt: 1 })] }, { ...empty, books: [B('y', { title: 'Same', updatedAt: 9 }), B('x', { title: 'Same', updatedAt: 1 })] });
  assert.deepEqual(r4.data.books.map((b: any) => b.id).sort(), ['x', 'y']);
  // shelves: two backup shelves of the same name are not collapsed; a local one still matches by name
  const r5 = mergeData({ ...empty, shelves: [{ id: 'l', name: 'Fav', color: '#f00', createdAt: 1 }] }, { ...empty, shelves: [{ id: 'a', name: 'fav', color: '#0f0', createdAt: 1 }, { id: 'b', name: 'New', color: '#0f0', createdAt: 1 }, { id: 'c', name: 'New', color: '#00f', createdAt: 1 }] } as any);
  assert.deepEqual(r5.data.shelves.map((s: any) => s.id), ['l', 'b', 'c']);
}
console.log('sync (key tombstones, natural keys): all assertions passed');
