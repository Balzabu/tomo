// Chunked persistence for the library - pure (type-only imports) so the
// read/write/migration protocol can be exercised under plain node with an
// in-memory key-value store.
//
// Why chunks: Android's AsyncStorage sits on SQLite and a single row larger
// than ~2MB cannot be read back (CursorWindow limit) even though it can be
// *written*. With the whole library under one key, a big enough collection
// (long Google Books descriptions, years of sessions) saved fine and then
// booted empty forever. Here every collection is split on item boundaries
// into chunks well under that limit, and a manifest records how many chunks
// each collection has.
//
// Layout (v2):
//   tomo:data:v2:meta               {"version":1,"chunks":{"books":3,...},"writtenAt":…}
//   tomo:data:v2:<collection>:<i>   a JSON array of items (chunk i of that collection)
//
// Writes go through one multiSet (a transaction on Android) so the manifest
// and its chunks never disagree; chunks beyond the new counts are removed
// afterwards, best-effort (the manifest is authoritative, so leftovers are
// simply ignored until they are cleaned up).
import type { AppData } from '@/types';

/** The subset of AsyncStorage this module needs (lets tests pass a fake). */
export interface KV {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: readonly (readonly [string, string])[]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export const V1_KEY = 'tomo:data:v1';
export const META_KEY = 'tomo:data:v2:meta';
export const CHUNK_PREFIX = 'tomo:data:v2:';
export const COLLECTIONS = ['books', 'sessions', 'notes', 'shelves', 'goals', 'deleted'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Target chunk size in JS chars. SQLite stores UTF-8 (≤3 bytes/char), so a
 *  chunk is at most ~1.2MB on disk - comfortably under the 2MB row limit. */
export const CHUNK_CHARS = 400_000;
/** Total serialised size past which the UI warns once per session (the DB is
 *  sized at 64MB via gradle.properties; this is ~24-48MB on disk). */
export const STORAGE_WARN_CHARS = 24_000_000;

export interface Manifest {
  version: number;
  chunks: Record<Collection, number>;
  writtenAt: number;
}

export const emptyAppData: AppData = {
  books: [],
  sessions: [],
  notes: [],
  shelves: [],
  goals: [],
  deleted: [],
  version: 1,
};

// All reads and writes of the library go through one queue: two overlapping
// saves would otherwise race - the older write's stale-chunk removal could
// delete chunks the newer write just stored, leaving a manifest that points
// at nothing. (AsyncStorage itself orders operations, but a save is several
// operations.) Errors propagate to the caller; the queue itself never breaks.
let queue: Promise<unknown> = Promise.resolve();
export function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function chunkKey(coll: Collection, i: number): string {
  return `${CHUNK_PREFIX}${coll}:${i}`;
}

function chunkKeysOf(manifest: Manifest): string[] {
  const keys: string[] = [];
  for (const coll of COLLECTIONS) {
    const n = manifest.chunks[coll] ?? 0;
    for (let i = 0; i < n; i++) keys.push(chunkKey(coll, i));
  }
  return keys;
}

/** Defaulting parse of the legacy single-blob format. Throws on invalid JSON. */
export function parseV1(raw: string): AppData {
  const parsed = JSON.parse(raw) as Partial<AppData>;
  if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  return {
    ...emptyAppData,
    ...parsed,
    books: Array.isArray(parsed.books) ? parsed.books : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
  };
}

/** What the last successful write stored under each chunk key: the item
 *  objects it was built from (and its length). Lets the next write skip
 *  chunks whose items are all the same objects - valid only while it mirrors
 *  the disk exactly (see storage.ts for when it is dropped). The JSON itself
 *  is not kept: that would hold a second copy of the library in memory. */
export type WrittenChunks = Map<string, { items: readonly unknown[]; chars: number }>;

export interface Encoded {
  /** manifest + the chunks to write: every chunk without `prev`, otherwise
   *  only those whose items changed */
  pairs: [string, string][];
  /** every chunk key of this encoding (written now or unchanged on disk) */
  chunkKeys: string[];
  /** the chunks of this encoding, to pass as `prev` once it is on disk */
  written: WrittenChunks;
  manifest: Manifest;
  /** total serialised chars across all chunks (rough on-disk footprint) */
  totalChars: number;
  /** items that alone exceed CHUNK_CHARS (stored shortened, see storedJson) */
  oversizedItems: number;
}

/** Cut a string to at most `max` chars without splitting a surrogate pair. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const code = s.charCodeAt(max - 1);
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/** The JSON stored for an item. One that alone exceeds CHUNK_CHARS would
 *  need a row the next launch can't read back (the CursorWindow limit), and
 *  with it the whole library - so its longest text fields are shortened until
 *  it fits (a book keeps its sessions and notes, it loses the tail of an
 *  enormous description). An item that still doesn't fit (bloated with
 *  something other than text) is left out, with a warning: losing one record
 *  beats losing them all. The in-memory copy is untouched until restart. */
function storedJson(item: unknown, s: string): string | null {
  if (s.length <= CHUNK_CHARS) return s;
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
  const copy = { ...(item as Record<string, unknown>) };
  const texts = Object.keys(copy)
    .filter((k) => typeof copy[k] === 'string')
    .sort((a, b) => (copy[b] as string).length - (copy[a] as string).length);
  let json = s;
  for (const k of texts) {
    const excess = json.length - CHUNK_CHARS;
    if (excess <= 0) break;
    const v = copy[k] as string;
    copy[k] = clip(v, Math.max(0, v.length - excess - 16));
    json = JSON.stringify(copy);
    // escapes (quotes, newlines) make the JSON longer than the text: keep cutting
    while (json.length > CHUNK_CHARS && (copy[k] as string).length > 0) {
      const cur = copy[k] as string;
      copy[k] = clip(cur, Math.floor(cur.length / 2));
      json = JSON.stringify(copy);
    }
  }
  if (json.length <= CHUNK_CHARS) return json;
  console.warn('storage: a record is too large to store and was left out');
  return null;
}

// Per-item JSON, keyed by object identity. The store never mutates an item in
// place (every change spreads into a new object), so a cached string stays
// valid for as long as its object lives - and a save re-stringifies only what
// changed instead of the whole library.
// Items stored shortened or left out (null) are cached as such, and counted.
const jsonCache = new WeakMap<object, string | null>();
const oversized = new WeakSet<object>();
function itemJson(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return JSON.stringify(item);
  let s = jsonCache.get(item);
  if (s === undefined) {
    const full = JSON.stringify(item);
    s = storedJson(item, full);
    if (s !== full) oversized.add(item);
    jsonCache.set(item, s);
  }
  return s;
}

/** Serialise the library into manifest + chunk pairs. Chunks are split on
 *  item boundaries so each one is an independently parseable JSON array.
 *  Boundaries are laid out greedily from the *end* of each collection: new
 *  items are prepended, so an add only changes chunk 0 and the others stay
 *  byte-identical (and are skipped by the write when `prev` knows them). */
export function encodeData(data: AppData, prev?: WrittenChunks | null): Encoded {
  const pairs: [string, string][] = [];
  const chunkKeys: string[] = [];
  const written: WrittenChunks = new Map();
  const chunks = { books: 0, sessions: 0, notes: 0, shelves: 0, goals: 0, deleted: 0 } as Record<Collection, number>;
  let totalChars = 0;
  let oversizedItems = 0;

  for (const coll of COLLECTIONS) {
    const items = data[coll] as unknown[];
    const strs = new Array<string | null>(items.length);
    // [start, end) ranges, collected back to front
    const ranges: [number, number][] = [];
    let end = items.length;
    let size = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const s = itemJson(items[i]);
      strs[i] = s;
      if (oversized.has(items[i] as object)) oversizedItems += 1;
      const len = s == null ? 0 : s.length + 1;
      if (end > i + 1 && size + len > CHUNK_CHARS) {
        ranges.push([i + 1, end]);
        end = i + 1;
        size = 0;
      }
      size += len;
    }
    if (end > 0) ranges.push([0, end]);
    ranges.reverse();

    ranges.forEach(([start, stop], idx) => {
      const key = chunkKey(coll, idx);
      const slice = items.slice(start, stop);
      const old = prev?.get(key);
      let chars: number;
      if (old && old.items.length === slice.length && old.items.every((x, j) => x === slice[j])) {
        chars = old.chars;
      } else {
        const body = `[${strs.slice(start, stop).filter((x) => x != null).join(',')}]`;
        pairs.push([key, body]);
        chars = body.length;
      }
      chunkKeys.push(key);
      written.set(key, { items: slice, chars });
      totalChars += chars;
    });
    chunks[coll] = ranges.length;
  }

  const manifest: Manifest = { version: data.version, chunks, writtenAt: Date.now() };
  const meta = JSON.stringify(manifest);
  totalChars += meta.length;
  return {
    pairs: [[META_KEY, meta], ...pairs],
    chunkKeys,
    written,
    manifest,
    totalChars,
    oversizedItems,
  };
}

/** Parse and concatenate a collection's chunks. null when any chunk is
 *  missing or not a JSON array (the stored data is then treated as
 *  unreadable, never as empty). */
export function decodeChunks(values: (string | null | undefined)[]): unknown[] | null {
  const out: unknown[] = [];
  for (const v of values) {
    if (v == null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch {
      return null;
    }
    if (!Array.isArray(parsed)) return null;
    for (const item of parsed) out.push(item);
  }
  return out;
}

export type LoadStatus = 'ok' | 'empty' | 'read_failed' | 'corrupt_v1';

export interface LoadResult {
  data: AppData;
  status: LoadStatus;
  /** the manifest the data was read from (v2 only) */
  manifest?: Manifest;
  /** set when a v1 blob was migrated to v2 during this load */
  migratedFromV1?: boolean;
  /** the unparseable v1 blob, for quarantine */
  rawV1?: string;
  /** removes a leftover v1 blob; the caller runs it (queued) once the load
   *  has returned, so it stays off the launch path */
  cleanup?: () => Promise<void>;
}

/** Read a v2 snapshot given its manifest text. The manifest and the chunks
 *  are two separate reads, so a write landing in between (the app saving
 *  while a widget refreshes) could pair one version's manifest with another's
 *  chunks: the manifest is re-read afterwards and the read retried while it
 *  keeps changing. null = unreadable (garbage manifest, missing/corrupt chunk). */
async function readV2(kv: KV, metaRaw: string): Promise<LoadResult | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifest = parseManifest(metaRaw);
    if (!manifest) return null;
    const keys = chunkKeysOf(manifest);
    let rows: readonly (readonly [string, string | null])[];
    let metaAfter: string | null;
    try {
      rows = keys.length ? await kv.multiGet(keys) : [];
      metaAfter = await kv.getItem(META_KEY);
    } catch {
      return null;
    }
    if (metaAfter != null && metaAfter !== metaRaw) {
      metaRaw = metaAfter; // a write landed in between: read the new version
      continue;
    }
    const byKey = new Map(rows.map(([k, v]) => [k, v]));
    const data: AppData = { ...emptyAppData, version: manifest.version };
    for (const coll of COLLECTIONS) {
      const n = manifest.chunks[coll];
      const values: (string | null | undefined)[] = [];
      for (let i = 0; i < n; i++) values.push(byKey.get(chunkKey(coll, i)));
      const items = decodeChunks(values);
      if (items == null) return null;
      (data as unknown as Record<Collection, unknown[]>)[coll] = items;
    }
    return { data, status: 'ok', manifest };
  }
  return null;
}

function parseManifest(raw: string): Manifest | null {
  try {
    const m = JSON.parse(raw) as Partial<Manifest>;
    if (!m || typeof m !== 'object' || !m.chunks || typeof m.chunks !== 'object') return null;
    const chunks = {} as Record<Collection, number>;
    for (const coll of COLLECTIONS) {
      const n = (m.chunks as Record<string, unknown>)[coll];
      chunks[coll] = typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    }
    return {
      version: typeof m.version === 'number' ? m.version : emptyAppData.version,
      chunks,
      writtenAt: typeof m.writtenAt === 'number' ? m.writtenAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Read the library. Prefers v2; falls back to (and, unless `readOnly`,
 * migrates) the legacy v1 blob. `readOnly` is for the headless widget
 * context, which runs in a separate JS runtime and must never write - a
 * periodic widget refresh migrating a stale v1 over fresher v2 data would
 * be a race the app can't see.
 */
export async function loadFromKV(kv: KV, opts?: { readOnly?: boolean }): Promise<LoadResult> {
  const readOnly = !!opts?.readOnly;
  const failed: LoadResult = { data: { ...emptyAppData }, status: 'read_failed' };

  let metaRaw: string | null;
  try {
    metaRaw = await kv.getItem(META_KEY);
  } catch {
    return failed;
  }

  if (metaRaw != null) {
    const v2 = await readV2(kv, metaRaw);
    if (v2) {
      if (!readOnly) {
        // A leftover v1 blob (process died between the v2 write and the v1
        // delete) is now redundant: v1 is never written again, so v2 is at
        // least as fresh. Checked via getAllKeys - reading it could throw.
        v2.cleanup = async () => {
          try {
            const all = await kv.getAllKeys();
            if (all.includes(V1_KEY)) await kv.removeItem(V1_KEY);
          } catch {
            // best-effort
          }
        };
      }
      return v2;
    }
    // v2 is unreadable (garbage manifest, missing or corrupt chunk). If the
    // v1 blob is still there, the migration never completed - v1 is the
    // intact source, so fall through and (re)migrate from it. Otherwise the
    // data on disk stays untouched and writes are blocked.
    let hasV1 = false;
    try {
      hasV1 = (await kv.getAllKeys()).includes(V1_KEY);
    } catch {
      return failed;
    }
    if (!hasV1) return failed;
  }

  // No (usable) v2: legacy blob or fresh install.
  let rawV1: string | null;
  try {
    rawV1 = await kv.getItem(V1_KEY);
  } catch {
    return failed;
  }
  if (rawV1 == null) return { data: { ...emptyAppData }, status: 'empty' };
  let data: AppData;
  try {
    data = parseV1(rawV1);
  } catch {
    return { data: { ...emptyAppData }, status: 'corrupt_v1', rawV1 };
  }
  if (readOnly) return { data, status: 'ok' };

  // Migrate: write v2 first, then drop v1. If the write fails the blob stays
  // and the migration is retried next launch; if the process dies after the
  // write, the next launch takes the v2 branch above and removes v1 there.
  try {
    const { manifest } = await saveToKV(kv, data, null);
    try {
      await kv.removeItem(V1_KEY);
    } catch {
      // cleaned up on the next launch
    }
    return { data, status: 'ok', manifest, migratedFromV1: true };
  } catch {
    // Migration failed but the data was read fine: the app can run on it and
    // any save will try the v2 write again.
    return { data, status: 'ok' };
  }
}

export interface SaveResult {
  manifest: Manifest;
  /** pass as `prevWritten` to the next save (only while nothing else has
   *  touched the chunks) */
  written: WrittenChunks;
  totalChars: number;
  oversizedItems: number;
  /** stale chunks could not be removed: the caller should not trust its
   *  previous-manifest bookkeeping and let the next save sweep by key listing */
  cleanupFailed: boolean;
}

/** Write the library as manifest + chunks (one multiSet), then remove chunks
 *  a previous, larger write left beyond the new counts. Throws when the write
 *  itself fails. With `prevWritten` (what the previous successful save left
 *  on disk) chunks whose content is unchanged are not rewritten. */
export async function saveToKV(
  kv: KV,
  data: AppData,
  prevManifest?: Manifest | null,
  prevWritten?: WrittenChunks | null
): Promise<SaveResult> {
  const enc = encodeData(data, prevWritten);
  await kv.multiSet(enc.pairs);

  // Chunks beyond the new counts are leftovers of a larger previous write.
  // With the previous manifest known this is a cheap arithmetic range; without
  // it (first save of the session, or after a failed cleanup) list the keys.
  let cleanupFailed = false;
  const sweep = async () => {
    const live = new Set([META_KEY, ...enc.chunkKeys]);
    const all = await kv.getAllKeys();
    const stale = all.filter((k) => k.startsWith(CHUNK_PREFIX) && !live.has(k));
    if (stale.length) await kv.multiRemove(stale);
  };
  try {
    if (prevManifest) {
      const stale: string[] = [];
      for (const coll of COLLECTIONS) {
        for (let i = enc.manifest.chunks[coll]; i < (prevManifest.chunks[coll] ?? 0); i++) {
          stale.push(chunkKey(coll, i));
        }
      }
      if (stale.length) await kv.multiRemove(stale);
    } else {
      await sweep();
    }
  } catch {
    // Leftovers are ignored by the manifest (never read back), they just take
    // space: try the full sweep once, else leave it to the next save.
    try {
      await sweep();
    } catch {
      cleanupFailed = true;
    }
  }
  return {
    manifest: enc.manifest,
    written: enc.written,
    totalChars: enc.totalChars,
    oversizedItems: enc.oversizedItems,
    cleanupFailed,
  };
}

/** Remove every v2 key and the legacy v1 blob (never the quarantine copy). */
export async function clearFromKV(kv: KV): Promise<void> {
  const all = await kv.getAllKeys();
  const doomed = all.filter((k) => k.startsWith(CHUNK_PREFIX) || k === V1_KEY);
  if (doomed.length) await kv.multiRemove(doomed);
}
