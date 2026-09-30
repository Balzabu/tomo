import { AppState, InteractionManager } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework as SAF } from 'expo-file-system/legacy';
import { useStore } from '@/store/useStore';
import { withLockGrace } from '@/store/useLock';
import { buildBackupJson } from '@/lib/backup';
import { didReadFail } from '@/lib/storage';

// Automatic backups into a folder the user picks (Android Storage Access
// Framework: any local folder, an SD card, or a synced one such as a cloud
// drive's folder). A backup is written when the app goes to the background
// or starts and one is due; the oldest files beyond the chosen count are
// removed.

const STORAGE_KEY = 'tomo:backup:v1';
const PREFIX = 'tomo-backup-';

export type BackupFrequency = 'daily' | 'weekly';
export const KEEP_CHOICES = [3, 5, 10, 20, 0] as const; // 0 = keep all

export interface AutoBackupConfig {
  enabled: boolean;
  dirUri?: string;
  frequency: BackupFrequency;
  keep: number;
  lastAt?: number;
  lastFile?: string;
  /** set when the last automatic attempt failed (folder gone, no access) */
  lastError?: string;
}

const DEFAULT: AutoBackupConfig = { enabled: false, frequency: 'daily', keep: 5 };

interface BackupState {
  hydrated: boolean;
  config: AutoBackupConfig;
  running: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<AutoBackupConfig>) => void;
}

export const useBackup = create<BackupState>((set, get) => ({
  hydrated: false,
  config: DEFAULT,
  running: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const config = { ...DEFAULT, ...(JSON.parse(raw) as Partial<AutoBackupConfig>) };
        // A garbled count must not prune every backup: 0 means "keep all",
        // anything else has to be a positive whole number.
        const keep = config.keep;
        if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 0) config.keep = DEFAULT.keep;
        set({ config });
      }
    } catch {
      // defaults
    }
    set({ hydrated: true });
  },
  update: (patch) => {
    const config = { ...get().config, ...patch };
    set({ config });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config)).catch(() => {});
  },
}));

/** Ask the user for the backup folder. null when they cancel. */
export async function pickBackupFolder(current?: string): Promise<string | null> {
  const res = await withLockGrace(() => SAF.requestDirectoryPermissionsAsync(current ?? null));
  return res.granted ? res.directoryUri : null;
}

/** "Documents/Tomo" from a tree URI (primary storage prefix dropped). */
export function folderLabel(uri?: string): string {
  if (!uri) return '';
  try {
    const tail = decodeURIComponent(uri.split('/tree/')[1] ?? uri);
    const [volume, path = ''] = tail.split(':');
    const name = path || volume;
    return volume === 'primary' ? name || '/' : `${volume}: ${path}`;
  } catch {
    return uri;
  }
}

function fileNameOf(uri: string): string {
  try {
    return decodeURIComponent(uri).split('/').pop() ?? '';
  } catch {
    return '';
  }
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type BackupResult = { ok: true; file: string } | { ok: false; error: 'no_folder' | 'no_data' | 'write' | 'busy' };

/** Write a backup into the chosen folder now, then prune old ones. */
export async function runBackup(): Promise<BackupResult> {
  const { config, running } = useBackup.getState();
  if (running) return { ok: false, error: 'busy' };
  if (!config.dirUri) return { ok: false, error: 'no_folder' };
  const s = useStore.getState();
  // Never write an empty backup over good ones when the library didn't load.
  if (!s.hydrated || didReadFail() || s.books.length === 0) return { ok: false, error: 'no_data' };
  useBackup.setState({ running: true });
  try {
    const json = await buildBackupJson({
      books: s.books,
      sessions: s.sessions,
      notes: s.notes,
      shelves: s.shelves,
      goals: s.goals,
      deleted: s.deleted,
      version: s.version,
    });
    const uri = await SAF.createFileAsync(config.dirUri, `${PREFIX}${stamp()}`, 'application/json');
    try {
      await SAF.writeAsStringAsync(uri, json);
    } catch (e) {
      // Don't leave an empty or partial file behind: it looks like a backup,
      // counts towards "keep", and pruning would delete a good one for it.
      await SAF.deleteAsync(uri, { idempotent: true }).catch(() => {});
      throw e;
    }
    const file = fileNameOf(uri);
    useBackup.getState().update({ lastAt: Date.now(), lastFile: file, lastError: undefined });
    await prune(config.dirUri, config.keep, file);
    return { ok: true, file };
  } catch (e) {
    useBackup.getState().update({ lastError: String(e) });
    return { ok: false, error: 'write' };
  } finally {
    useBackup.setState({ running: false });
  }
}

const AUTO_NAME = /^tomo-backup-\d{4}-\d{2}-\d{2}_\d{6}( \(\d+\))?(\.json)?$/;

async function prune(dirUri: string, keep: number, justWritten: string): Promise<void> {
  if (!keep) return;
  try {
    const files = (await SAF.readDirectoryAsync(dirUri))
      .map((uri) => ({ uri, name: fileNameOf(uri) }))
      // Only files this feature wrote (tomo-backup-YYYY-MM-DD_HHMMSS, with or
      // without ".json" depending on the provider) - never a manual export or
      // anything else the user keeps in that folder.
      .filter((f) => AUTO_NAME.test(f.name) && f.name !== justWritten)
      // The name carries the timestamp, so name order is age order.
      .sort((a, b) => b.name.localeCompare(a.name));
    // The file just written always stays; it counts as one of `keep`.
    for (const f of files.slice(Math.max(0, keep - 1))) await SAF.deleteAsync(f.uri, { idempotent: true });
  } catch {
    // pruning is best-effort; the next backup tries again
  }
}

const DAY = 86_400_000;

/** Back up if automatic backups are on and one is due. */
export async function maybeAutoBackup(): Promise<void> {
  const { config, hydrated } = useBackup.getState();
  if (!hydrated || !config.enabled || !config.dirUri) return;
  const every = config.frequency === 'weekly' ? 7 * DAY : DAY;
  // A little slack so "daily" at a similar time each day still triggers.
  if (config.lastAt && Date.now() - config.lastAt < every - 2 * 3600_000) return;
  await runBackup();
}

let armed = false;
/** Start watching: back up when the app is left (and at startup) if due. */
export function watchAutoBackup(): void {
  if (armed) return;
  armed = true;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') void maybeAutoBackup();
  });
  // Serialising the library (and reading every custom cover) is heavy JS
  // work: at startup, wait for any running animation or gesture to finish.
  setTimeout(() => InteractionManager.runAfterInteractions(() => void maybeAutoBackup()), 8000);
}
