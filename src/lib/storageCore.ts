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
export const COLLECTIONS = ['books', 'sessions', 'notes', 'shelves', 'goals'] as const;
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
  };
}

export interface Encoded {
  pairs: [string, string][];
  manifest: Manifest;
  /** total serialised chars across all chunks (rough on-disk footprint) */
  totalChars: number;
  /** items that alone exceed CHUNK_CHARS (they get a chunk of their own) */
  oversizedItems: number;
}

/** Serialise the library into manifest + chunk pairs. Chunks are split on
 *  item boundaries so each one is an independently parseable JSON array. */
export function encodeData(data: AppData): Encoded {
  const pairs: [string, string][] = [];
  const chunks = { books: 0, sessions: 0, notes: 0, shelves: 0, goals: 0 } as Record<Collection, number>;
  let totalChars = 0;
  let oversizedItems = 0;

  for (const coll of COLLECTIONS) {
    const items = data[coll] as unknown[];
    let parts: string[] = [];
    let size = 0;
    const flush = () => {
      if (parts.length === 0) return;
      const body = `[${parts.join(',')}]`;
      pairs.push([chunkKey(coll, chunks[coll]), body]);
      chunks[coll] += 1;
      totalChars += body.length;
      parts = [];
      size = 0;
    };
    for (const item of items) {
      const s = JSON.stringify(item);
      if (s.length > CHUNK_CHARS) oversizedItems += 1;
      if (parts.length > 0 && size + s.length + 1 > CHUNK_CHARS) flush();
      parts.push(s);
      size += s.length + 1;
    }
    flush();
  }

  const manifest: Manifest = { version: data.version, chunks, writtenAt: Date.now() };
  const meta = JSON.stringify(manifest);
  totalChars += meta.length;
  return { pairs: [[META_KEY, meta], ...pairs], manifest, totalChars, oversizedItems };
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
        try {
          const all = await kv.getAllKeys();
          if (all.includes(V1_KEY)) await kv.removeItem(V1_KEY);
        } catch {
          // best-effort
        }
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
  totalChars: number;
  oversizedItems: number;
  /** stale chunks could not be removed: the caller should not trust its
   *  previous-manifest bookkeeping and let the next save sweep by key listing */
  cleanupFailed: boolean;
}

/** Write the library as manifest + chunks (one multiSet), then remove chunks
 *  a previous, larger write left beyond the new counts. Throws when the write
 *  itself fails. */
export async function saveToKV(kv: KV, data: AppData, prevManifest?: Manifest | null): Promise<SaveResult> {
  const enc = encodeData(data);
  await kv.multiSet(enc.pairs);

  // Chunks beyond the new counts are leftovers of a larger previous write.
  // With the previous manifest known this is a cheap arithmetic range; without
  // it (first save of the session, or after a failed cleanup) list the keys.
  let cleanupFailed = false;
  const sweep = async () => {
    const live = new Set(enc.pairs.map(([k]) => k));
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
