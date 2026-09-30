import assert from 'node:assert/strict';
import { loadFromKV, saveToKV, clearFromKV, encodeData, V1_KEY, META_KEY, CHUNK_PREFIX, chunkKey, CHUNK_CHARS } from '../../src/lib/storageCore.ts';

const ROW_LIMIT = 2_000_000;
function makeKV() {
  const m = new Map<string, string>();
  const writes: string[] = [];
  const kv = {
    map: m, writes,
    async getItem(k: string) { const v = m.get(k) ?? null; if (v && v.length > ROW_LIMIT) throw new Error('Row too big'); return v; },
    async multiGet(keys: readonly string[]) { return keys.map((k) => { const v = m.get(k) ?? null; if (v && v.length > ROW_LIMIT) throw new Error('Row too big'); return [k, v] as const; }); },
    async multiSet(pairs: readonly (readonly [string, string])[]) { for (const [k, v] of pairs) { m.set(k, v); writes.push(k); } },
    async multiRemove(keys: readonly string[]) { for (const k of keys) m.delete(k); },
    async removeItem(k: string) { m.delete(k); },
    async getAllKeys() { return [...m.keys()]; },
  };
  return kv;
}
const book = (i: number) => ({ id: `b${i}`, title: `Book ${i}`, authors: ['A'], description: 'x'.repeat(3000), status: 'finished', currentPage: 0, addedAt: i, shelfIds: [], source: 'manual' });
const big = { books: Array.from({ length: 1000 }, (_, i) => book(i)), sessions: Array.from({ length: 5000 }, (_, i) => ({ id: `s${i}`, bookId: 'b1', startTime: i, endTime: i + 1, durationSeconds: 60, pagesRead: 3, date: '2025-01-01' })), notes: [], shelves: [{ id: 'sh', name: 'x', color: '#fff', createdAt: 1 }], goals: [], deleted: [], version: 1 } as any;

// (a) fresh install
{ const kv = makeKV(); const r = await loadFromKV(kv); assert.equal(r.status, 'empty'); assert.equal(kv.writes.length, 0); }

// (b) v1 blob > 2MB: unreadable as a single row — documented as unrecoverable
{ const kv = makeKV(); kv.map.set(V1_KEY, JSON.stringify(big)); assert.ok(kv.map.get(V1_KEY)!.length > ROW_LIMIT); const r = await loadFromKV(kv); assert.equal(r.status, 'read_failed'); }

// (b2) v1 blob just under the limit migrates to v2 and is removed
{ const kv = makeKV(); const mid = { ...big, books: big.books.slice(0, 300) }; kv.map.set(V1_KEY, JSON.stringify(mid)); assert.ok(kv.map.get(V1_KEY)!.length < ROW_LIMIT);
  const r = await loadFromKV(kv); assert.equal(r.status, 'ok'); assert.equal(r.migratedFromV1, true); assert.equal(r.data.books.length, 300); assert.equal(r.data.sessions.length, 5000);
  assert.equal(kv.map.has(V1_KEY), false); assert.ok(kv.map.has(META_KEY));
  for (const [k, v] of kv.map) if (k.startsWith(CHUNK_PREFIX)) assert.ok(v.length <= CHUNK_CHARS + 2, `${k} ${v.length}`);
  const r2 = await loadFromKV(kv); assert.equal(r2.status, 'ok'); assert.deepEqual(r2.data, mid); }

// (c) v1 + v2 both present → v2 wins, v1 removed
{ const kv = makeKV(); await saveToKV(kv, { ...big, books: big.books.slice(0, 2) }, null); kv.map.set(V1_KEY, JSON.stringify({ ...big, books: [] }));
  const r = await loadFromKV(kv); assert.equal(r.status, 'ok'); assert.equal(r.data.books.length, 2);
  // the leftover is removed by the returned cleanup, off the launch path
  assert.ok(kv.map.has(V1_KEY)); assert.ok(r.cleanup); await r.cleanup!(); assert.equal(kv.map.has(V1_KEY), false); }

// (d) readOnly with only v1: returns data, writes nothing, v1 stays
{ const kv = makeKV(); const small = { ...big, books: big.books.slice(0, 3), sessions: [] }; kv.map.set(V1_KEY, JSON.stringify(small));
  const r = await loadFromKV(kv, { readOnly: true }); assert.equal(r.status, 'ok'); assert.equal(r.data.books.length, 3); assert.equal(kv.writes.length, 0); assert.ok(kv.map.has(V1_KEY)); }
// (d2) readOnly with v2 present and a leftover v1: reads v2, does not delete v1
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.set(V1_KEY, 'stale'); const before = kv.writes.length;
  const r = await loadFromKV(kv, { readOnly: true }); assert.equal(r.status, 'ok'); assert.equal(r.data.books.length, 1000); assert.equal(kv.writes.length, before); assert.ok(kv.map.has(V1_KEY)); }

// (e) large then small: stale chunks removed, round-trip deep-equal
{ const kv = makeKV(); const r1 = await saveToKV(kv, big, null); const chunksBefore = [...kv.map.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length; assert.ok(r1.manifest.chunks.books > 1);
  const small = { ...big, books: big.books.slice(0, 5), sessions: big.sessions.slice(0, 10) };
  await saveToKV(kv, small, r1.manifest); const chunksAfter = [...kv.map.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length;
  assert.ok(chunksAfter < chunksBefore); const r = await loadFromKV(kv); assert.equal(r.status, 'ok'); assert.deepEqual(r.data, small);
  // saving again without prevManifest also cleans via getAllKeys
  await saveToKV(kv, big, null); await saveToKV(kv, small, null); assert.equal([...kv.map.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length, chunksAfter); assert.deepEqual((await loadFromKV(kv)).data, small); }

// (f) a chunk listed in the manifest is missing → read_failed; corrupt chunk → read_failed; garbage manifest → read_failed
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.delete(chunkKey('books', 0)); assert.equal((await loadFromKV(kv)).status, 'read_failed'); }
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.set(chunkKey('sessions', 0), '{not json'); assert.equal((await loadFromKV(kv)).status, 'read_failed'); }
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.set(META_KEY, 'garbage'); assert.equal((await loadFromKV(kv)).status, 'read_failed'); }

// (g) an oversized single item is counted and stored shortened, so its row stays readable
{ const kv = makeKV(); const desc = 'y'.repeat(CHUNK_CHARS + 10); const huge = { ...big, books: [{ ...book(1), description: desc }, book(2)], sessions: [] }; const r = await saveToKV(kv, huge, null); assert.equal(r.oversizedItems, 1);
  for (const [k, v] of kv.map) if (k.startsWith(CHUNK_PREFIX)) assert.ok(v.length <= CHUNK_CHARS + 2, `${k} ${v.length}`);
  const back = (await loadFromKV(kv)).data; assert.equal(back.books.length, 2); assert.deepEqual(back.books[1], book(2));
  const b1: any = back.books[0]; assert.equal(b1.title, 'Book 1'); assert.ok(b1.description.length < desc.length && desc.startsWith(b1.description) && b1.description.length > CHUNK_CHARS - 10_000);
  // escape-heavy text (each newline is two JSON chars) still ends up under the limit
  const nl = { ...huge, books: [{ ...book(3), review: '\n'.repeat(CHUNK_CHARS) }] }; const r2 = await saveToKV(kv, nl, r.manifest); assert.equal(r2.oversizedItems, 1);
  for (const [k, v] of kv.map) if (k.startsWith(CHUNK_PREFIX)) assert.ok(v.length <= CHUNK_CHARS + 2, `${k} ${v.length}`);
  assert.equal((await loadFromKV(kv)).status, 'ok');
  // bloat that isn't text can't be shortened: that one record is left out, the rest stays readable
  const junk = { ...big, books: [{ ...book(4), shelfIds: Array.from({ length: CHUNK_CHARS / 4 }, (_, i) => `s${i}`) }, book(5)], sessions: [] };
  const r3 = await saveToKV(kv, junk, r2.manifest); assert.equal(r3.oversizedItems, 1);
  const back3 = await loadFromKV(kv); assert.equal(back3.status, 'ok'); assert.deepEqual(back3.data.books, [book(5)]); }

// (h) clear leaves the quarantine key and other tomo keys alone
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.set(V1_KEY, 'x'); kv.map.set('tomo:data:corrupt:v1', 'q'); kv.map.set('tomo:settings:v2', 's');
  await clearFromKV(kv); assert.deepEqual([...kv.map.keys()].sort(), ['tomo:data:corrupt:v1', 'tomo:settings:v2']); assert.equal((await loadFromKV(kv)).status, 'empty'); }

// (i) corrupt v1
{ const kv = makeKV(); kv.map.set(V1_KEY, '{oops'); const r = await loadFromKV(kv); assert.equal(r.status, 'corrupt_v1'); assert.equal(r.rawV1, '{oops'); assert.equal(kv.writes.length, 0); }

// (j) empty collections encode to zero chunks
{ const e = encodeData({ books: [], sessions: [], notes: [], shelves: [], goals: [], deleted: [], version: 1 }); assert.equal(e.pairs.length, 1); assert.deepEqual(e.manifest.chunks, { books: 0, sessions: 0, notes: 0, shelves: 0, goals: 0, deleted: 0 }); }
console.log('storage: all assertions passed');

// ---- review fixes ----
import { queued } from '../../src/lib/storageCore.ts';

// (k) concurrent saves are serialised through queued(): the older write's
// stale-chunk removal can't delete the newer write's chunks
{
  const kv = makeKV();
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const slowKv = { ...kv, async multiRemove(keys: readonly string[]) { await delay(20); return kv.multiRemove(keys); } };
  const first = await saveToKV(slowKv, big, null); // 6+ chunks of books
  const small = { ...big, books: big.books.slice(0, 2), sessions: [] };
  // A: shrink (prev = first), B: grow back (prev = first) - issued back to back
  const a = queued(() => saveToKV(slowKv, small, first.manifest));
  const b = queued(() => saveToKV(slowKv, big, first.manifest));
  await Promise.all([a, b]);
  const r = await loadFromKV(kv);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.data, big);
}
// (k2) a rejected queued call doesn't break the queue
{
  await queued(async () => { throw new Error('boom'); }).catch(() => {});
  assert.equal(await queued(async () => 42), 42);
}

// (l) v2 unreadable (half-finished migration) but v1 still present → v1 is used and migrated
{
  const kv = makeKV(); const small = { ...big, books: big.books.slice(0, 3), sessions: big.sessions.slice(0, 5) };
  kv.map.set(V1_KEY, JSON.stringify(small));
  await saveToKV(kv, small, null); kv.map.delete(chunkKey('books', 0)); // torn v2
  const r = await loadFromKV(kv); assert.equal(r.status, 'ok'); assert.deepEqual(r.data, small); assert.equal(r.migratedFromV1, true);
  assert.equal(kv.map.has(V1_KEY), false); assert.deepEqual((await loadFromKV(kv)).data, small);
}
// (l2) v2 unreadable and no v1 → still read_failed (nothing overwritten)
{ const kv = makeKV(); await saveToKV(kv, big, null); kv.map.delete(chunkKey('books', 0)); assert.equal((await loadFromKV(kv)).status, 'read_failed'); assert.ok(kv.map.has(META_KEY)); }

// (m) a write landing between the manifest read and the chunk read → the load retries and returns the new version
{
  const kv = makeKV(); const small = { ...big, books: big.books.slice(0, 2), sessions: [] };
  await saveToKV(kv, big, null);
  let raced = false;
  const racy = { ...kv, async multiGet(keys: readonly string[]) {
    if (!raced) { raced = true; await saveToKV(kv, small, null); } // concurrent app write
    return kv.multiGet(keys);
  } };
  const r = await loadFromKV(racy, { readOnly: true });
  assert.equal(r.status, 'ok'); assert.deepEqual(r.data, small);
}

// (n) failed stale cleanup falls back to a key sweep; if that fails too, cleanupFailed is reported
{
  const kv = makeKV(); const first = await saveToKV(kv, big, null);
  let calls = 0;
  const flaky = { ...kv, async multiRemove(keys: readonly string[]) { calls++; if (calls === 1) throw new Error('busy'); return kv.multiRemove(keys); } };
  const small = { ...big, books: big.books.slice(0, 1), sessions: [] };
  const r = await saveToKV(flaky, small, first.manifest);
  assert.equal(r.cleanupFailed, false);
  assert.equal([...kv.map.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length, 3); // meta + books:0 + shelves:0
  const broken = { ...kv, async multiRemove() { throw new Error('busy'); } };
  const r2 = await saveToKV(broken, big, r.manifest);
  const r3 = await saveToKV(broken, small, r2.manifest);
  assert.equal(r3.cleanupFailed, true);
  assert.deepEqual((await loadFromKV(kv)).data, small); // manifest still authoritative despite leftovers
}
console.log('storage (review fixes): all assertions passed');

// ---- incremental writes ----
const concatRead = (kv: ReturnType<typeof makeKV>, coll: string, n: number) =>
  Array.from({ length: n }, (_, i) => JSON.parse(kv.map.get(chunkKey(coll as any, i))!)).flat();

// (o) prepending an item changes only chunk 0; the other chunk bodies stay byte-identical
{
  const e1 = encodeData(big);
  assert.ok(e1.manifest.chunks.books > 2);
  const withNew = { ...big, books: [book(9999), ...big.books] };
  const e2 = encodeData(withNew);
  assert.equal(e2.manifest.chunks.books, e1.manifest.chunks.books);
  const body = (e: typeof e1, k: string) => e.pairs.find(([key]) => key === k)![1];
  assert.notEqual(body(e2, chunkKey('books', 0)), body(e1, chunkKey('books', 0)));
  for (let i = 1; i < e1.manifest.chunks.books; i++) assert.equal(body(e2, chunkKey('books', i)), body(e1, chunkKey('books', i)));
  // boundaries are packed from the end: every chunk but the first is full-ish
  for (let i = 1; i < e1.manifest.chunks.books; i++) assert.ok(body(e1, chunkKey('books', i)).length > CHUNK_CHARS - 3100);
  for (const [k, v] of e2.pairs) if (k !== META_KEY) assert.ok(v.length <= CHUNK_CHARS + 2, k);
}

// (p) with the previous write known, only the manifest and the changed chunks are written; readers concatenate
{
  const kv = makeKV();
  const r1 = await saveToKV(kv, big, null, null);
  const nChunks = [...kv.map.keys()].filter((k) => k.startsWith(CHUNK_PREFIX) && k !== META_KEY).length;
  assert.equal(kv.writes.length, nChunks + 1); // first save: everything
  // unchanged data: manifest only
  kv.writes.length = 0;
  const r2 = await saveToKV(kv, big, r1.manifest, r1.written);
  assert.deepEqual(kv.writes, [META_KEY]);
  // a prepended session touches sessions:0 only
  kv.writes.length = 0;
  const s = { ...big, sessions: [{ id: 'snew', bookId: 'b1', startTime: 9, endTime: 10, durationSeconds: 60, pagesRead: 3, date: '2025-01-02' }, ...big.sessions] };
  const r3 = await saveToKV(kv, s, r2.manifest, r2.written);
  assert.deepEqual(kv.writes, [META_KEY, chunkKey('sessions', 0)]);
  assert.deepEqual((await loadFromKV(kv)).data, s);
  assert.deepEqual(concatRead(kv, 'sessions', r3.manifest.chunks.sessions), s.sessions);
  // an edit in the middle rewrites only the chunk holding it
  kv.writes.length = 0;
  const edited = { ...s, books: s.books.map((b: any, i: number) => (i === 500 ? { ...b, title: 'Edited' } : b)) };
  const r4 = await saveToKV(kv, edited, r3.manifest, r3.written);
  assert.equal(kv.writes.length, 2); assert.equal(kv.writes[0], META_KEY); assert.ok(kv.writes[1].startsWith(`${CHUNK_PREFIX}books:`));
  assert.deepEqual((await loadFromKV(kv)).data, edited);
  // new object identities (a restore) are rewritten, even with equal content
  kv.writes.length = 0;
  const cloned = JSON.parse(JSON.stringify(edited));
  const r5 = await saveToKV(kv, cloned, r4.manifest, r4.written);
  assert.equal(kv.writes.length, 1 + r4.manifest.chunks.books + r4.manifest.chunks.sessions + 1); // meta + books + sessions + shelves
  assert.equal(r5.totalChars, encodeData(cloned).totalChars);
  // shrinking still removes the stale tail chunks
  const small = { ...cloned, books: cloned.books.slice(0, 3), sessions: [] };
  await saveToKV(kv, small, r5.manifest, r5.written);
  const live = new Set(encodeData(small).pairs.map(([k]) => k));
  for (const k of kv.map.keys()) if (k.startsWith(CHUNK_PREFIX)) assert.ok(live.has(k), `stale ${k}`);
  assert.deepEqual((await loadFromKV(kv)).data, small);
}

// (q) growing past a chunk boundary renumbers: every shifted chunk is rewritten
{
  const kv = makeKV();
  const r1 = await saveToKV(kv, big, null, null);
  let books = big.books; let r = r1; let i = 0;
  while (encodeData({ ...big, books }).manifest.chunks.books === r1.manifest.chunks.books) books = [book(20000 + i++), ...books];
  const grown = { ...big, books };
  kv.writes.length = 0;
  r = await saveToKV(kv, grown, r.manifest, r.written);
  assert.equal(kv.writes.filter((k) => k.includes(':books:')).length, r.manifest.chunks.books);
  assert.deepEqual((await loadFromKV(kv)).data, grown);
}

// (r) plain concatenation of the chunks round-trips; without prev every chunk is dirty
{
  const e = encodeData(big);
  const byColl: Record<string, string[]> = {};
  for (const [k, v] of e.pairs.slice(1)) (byColl[k.split(':')[3]] ??= []).push(v);
  assert.deepEqual(byColl.books.flatMap((v) => JSON.parse(v)), big.books);
  assert.deepEqual(e.chunkKeys, e.pairs.slice(1).map(([k]) => k)); // no prev: every chunk is written
  // with prev, unchanged chunks aren't in pairs but still count in chunkKeys/totalChars
  const e2 = encodeData(big, e.written);
  assert.deepEqual(e2.pairs.map(([k]) => k), [META_KEY]); assert.deepEqual(e2.chunkKeys, e.chunkKeys);
  assert.equal(e2.totalChars - e2.pairs[0][1].length, e.totalChars - e.pairs[0][1].length);
}
console.log('storage (incremental writes): all assertions passed');
