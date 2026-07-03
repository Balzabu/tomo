import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '@/types';

const STORAGE_KEY = 'tomo:data:v1';
// A blob that fails to parse is copied here before being abandoned, so a
// corrupted library can still be recovered by hand instead of being
// overwritten by the first debounced write of the near-empty fresh state.
const QUARANTINE_KEY = 'tomo:data:corrupt:v1';

export const emptyData: AppData = {
  books: [],
  sessions: [],
  notes: [],
  shelves: [],
  goals: [],
  version: 1,
};

// Set when the stored blob could not be *read* (as opposed to parsed): the
// data may still be intact on disk (e.g. Android's ~2MB CursorWindow read
// limit), so implicit debounced writes must not overwrite it. An explicit
// restore/clear (replaceAll) still may, via { force: true }.
let readFailed = false;

export async function loadData(): Promise<AppData> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to read stored data', e);
    readFailed = true;
    return { ...emptyData };
  }
  if (!raw) return { ...emptyData };
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData,
      ...parsed,
      books: parsed.books ?? [],
      sessions: parsed.sessions ?? [],
      notes: parsed.notes ?? [],
      shelves: parsed.shelves ?? [],
      goals: parsed.goals ?? [],
    };
  } catch (e) {
    console.warn('Failed to parse stored data, starting fresh', e);
    void AsyncStorage.setItem(QUARANTINE_KEY, raw).catch(() => {});
    return { ...emptyData };
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    readFailed = false;
    return true;
  } catch (e) {
    console.warn('Failed to persist data', e);
    return false;
  }
}

export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  readFailed = false;
}
