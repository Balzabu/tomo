import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '@/types';
import {
  clearFromKV,
  emptyAppData,
  loadFromKV,
  Manifest,
  queued,
  saveToKV,
} from '@/lib/storageCore';

// Thin binding of the chunked storage protocol (src/lib/storageCore.ts) to
// AsyncStorage, plus the module-level "the disk may hold data we couldn't
// read" guard shared by the store.

// A v1 blob that fails to parse is copied here before being abandoned, so a
// corrupted library can still be recovered by hand instead of being
// overwritten by the first debounced write of the near-empty fresh state.
const QUARANTINE_KEY = 'tomo:data:corrupt:v1';

export const emptyData: AppData = emptyAppData;

// Set when the stored data could not be *read* (as opposed to parsed): it may
// still be intact on disk (a chunk read threw, a manifest was unreadable), so
// implicit debounced writes must not overwrite it. An explicit restore/clear
// (replaceAll) still may, via { force: true }.
//
// Note: a library that hit the old single-row limit before this format
// existed cannot be recovered from JS - there is no partial-read API - so the
// chunked layout prevents the trap for everyone else rather than curing it.
let readFailed = false;
let lastManifest: Manifest | null = null;
let footprint: { totalChars: number; oversizedItems: number } | null = null;

export async function loadData(opts?: { readOnly?: boolean }): Promise<AppData> {
  const res = await queued(() => loadFromKV(AsyncStorage, opts));
  switch (res.status) {
    case 'ok':
      lastManifest = res.manifest ?? null;
      return res.data;
    case 'empty':
      return { ...emptyData };
    case 'read_failed':
      console.warn('Failed to read stored data');
      readFailed = true;
      return { ...emptyData };
    case 'corrupt_v1': {
      console.warn('Failed to parse stored data, starting fresh');
      if (!opts?.readOnly && res.rawV1 != null) {
        try {
          await AsyncStorage.setItem(QUARANTINE_KEY, res.rawV1);
        } catch {
          // Couldn't even keep a copy: refuse to overwrite the original.
          readFailed = true;
        }
      }
      return { ...emptyData };
    }
  }
}

// Surfaced to the UI when a write fails (storage full, AsyncStorage limit):
// swallowing it would let the app look fine in memory while every change
// silently evaporates on the next restart.
export const PERSIST_FAILED = 'PERSIST_FAILED';

/** Returns whether the write succeeded - callers decide how loudly to fail. */
export async function saveData(data: AppData, opts?: { force?: boolean }): Promise<boolean> {
  // The library couldn't be read at launch: refuse to clobber what may still
  // be intact on disk. The caller surfaces this like any failed write.
  if (readFailed && !opts?.force) return false;
  try {
    // Serialised with every other storage operation (see storageCore.queued):
    // a debounced flush, a background flush and a restore can overlap.
    const r = await queued(() => saveToKV(AsyncStorage, data, lastManifest));
    // A failed stale-chunk cleanup means the arithmetic range can't be
    // trusted next time: forget the manifest so the next save sweeps by key.
    lastManifest = r.cleanupFailed ? null : r.manifest;
    footprint = { totalChars: r.totalChars, oversizedItems: r.oversizedItems };
    readFailed = false;
    return true;
  } catch (e) {
    console.warn('Failed to persist data', e);
    return false;
  }
}

/** Whether the last launch-time read of the library failed (data may still be
 *  intact on disk). Callers must not run destructive reconciliation on the
 *  empty in-memory state while this is true. */
export function didReadFail(): boolean {
  return readFailed;
}

/** Size of the last successful write, for the "library is getting large"
 *  warning. */
export function lastSaveFootprint(): { totalChars: number; oversizedItems: number } | null {
  return footprint;
}

export async function clearData(): Promise<void> {
  await queued(() => clearFromKV(AsyncStorage));
  lastManifest = null;
  footprint = null;
  readFailed = false;
}
