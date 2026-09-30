import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPin, isValidPin, lockoutMs, newSalt, verifyPin } from '@/lib/lockCore';
import { monotonicClock, setRecentsHidden } from '../../modules/tomo-system';

// App lock (PIN, optionally biometrics). The config lives in its own key so
// clearing or restoring the library never touches it.
const STORAGE_KEY = 'tomo:lock:v1';

export const LOCK_TIMEOUTS = [0, 60, 300, 900] as const;

export interface LockConfig {
  enabled: boolean;
  salt: string;
  hash: string;
  pinLength: number;
  biometric: boolean;
  /** seconds in the background before the app locks again */
  timeoutSec: number;
  /** blank the app in the recent-apps switcher while the lock is on */
  hideRecents: boolean;
  /** widgets and notifications show nothing personal while the lock is on */
  hidePrivate: boolean;
  failures: number;
  /** PIN entry is paused until the monotonic clock (see monotonicClock)
   *  reaches blockedUntil on boot `blockedBoot`; after a reboot the pause
   *  restarts for `blockedFor` ms. The wall clock isn't used: changing the
   *  device time must not skip the pause. */
  blockedUntil: number;
  blockedBoot: number;
  blockedFor: number;
}

const DEFAULT: LockConfig = {
  enabled: false,
  salt: '',
  hash: '',
  pinLength: 4,
  biometric: false,
  timeoutSec: 0,
  hideRecents: true,
  hidePrivate: true,
  failures: 0,
  blockedUntil: 0,
  blockedBoot: 0,
  blockedFor: 0,
};

interface LockState {
  hydrated: boolean;
  config: LockConfig;
  /** the lock screen is showing */
  locked: boolean;
  /** until this ms timestamp, leaving the app doesn't re-lock it (pickers,
   *  share sheets and permission dialogs the app itself opened) */
  graceUntil: number;
  /** monotonic time the app went to the background (0 = in front) */
  leftAt: number;
  /** it left for something the app opened itself (picker, share sheet…) */
  leftInGrace: boolean;

  hydrate: () => Promise<void>;
  /** false when the setting couldn't be saved (nothing changed) */
  enable: (pin: string) => Promise<boolean>;
  disable: () => Promise<boolean>;
  changePin: (pin: string) => Promise<boolean>;
  update: (patch: Partial<Pick<LockConfig, 'biometric' | 'timeoutSec' | 'hideRecents' | 'hidePrivate'>>) => void;
  /** 'ok' unlocks; 'wrong' counts a failure; 'wait' while throttled */
  tryPin: (pin: string) => Promise<'ok' | 'wrong' | 'wait'>;
  /** a PIN check that doesn't unlock (confirming before disabling) */
  checkPin: (pin: string) => Promise<'ok' | 'wrong' | 'wait'>;
  unlock: () => void;
  lock: () => void;
  allowExternal: (ms?: number) => void;
  /** ms of PIN pause left (0 = can type) */
  blockedMs: () => number;
  /** the app went to the background now */
  markLeft: () => void;
  /** back in front: decide (and apply) the lock; returns whether it locked */
  markBack: () => boolean;
}

/** How long a picker/share sheet/permission prompt may keep the app in the
 *  background without the lock applying (never more than a minute). */
const MAX_GRACE_AWAY = 60_000;

/** Pure: should a return after `away` ms lock? */
function shouldLock(config: LockConfig, away: number, graced: boolean): boolean {
  if (!config.enabled) return false;
  // The monotonic clock never goes back; anything odd locks.
  if (!Number.isFinite(away) || away < 0) return true;
  const limit = Math.max(2000, config.timeoutSec * 1000);
  if (graced && away < Math.max(limit, MAX_GRACE_AWAY)) return false;
  return away >= limit;
}

/** Synchronous check for code that is about to act on a deep link or a
 *  notification: locked now, or about to lock on this resume. */
export function isLockedOrDue(): boolean {
  const s = useLock.getState();
  if (!s.hydrated) return true;
  if (s.locked) return true;
  if (!s.leftAt) return false;
  return shouldLock(s.config, monotonicClock().elapsed - s.leftAt, s.leftInGrace);
}

function persist(config: LockConfig) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config)).catch((e) =>
    console.warn('Failed to persist lock settings', e)
  );
}

/** Awaited write, for changes that must not exist only in memory. */
async function persistNow(config: LockConfig): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.warn('Failed to persist lock settings', e);
    return false;
  }
}

// One PIN check at a time: two taps racing through the awaited write must not
// both get a free attempt.
let pinBusy = false;

/**
 * Check a PIN against the throttle. The failure is written to disk *before*
 * the PIN is compared, so killing the app right after a wrong guess (or a
 * write that never lands) can't hand out fresh attempts. A failing disk
 * never locks the owner out: the check still runs, counted in memory.
 */
async function attemptPin(pin: string, onOk: (c: LockConfig) => void): Promise<'ok' | 'wrong' | 'wait'> {
  if (pinBusy) return 'wait';
  pinBusy = true;
  try {
    const st = useLock.getState();
    if (st.blockedMs() > 0) return 'wait';
    const c = st.config;
    const pessimistic = failed(c);
    await persistNow(pessimistic);
    if (verifyPin(pin, c.salt, c.hash)) {
      const config = { ...c, failures: 0, blockedUntil: 0, blockedFor: 0 };
      useLock.setState({ config });
      persist(config);
      onOk(config);
      return 'ok';
    }
    useLock.setState({ config: pessimistic });
    return 'wrong';
  } finally {
    pinBusy = false;
  }
}

function applyRecents(config: LockConfig) {
  setRecentsHidden(config.enabled && config.hideRecents);
}

/** Widgets and reminders depend on the lock state: redo them when it changes.
 *  Lazy require - the widget code imports the stores. */
function refreshPlacedWidgets(): void {
  try {
    const { refreshWidgets } = require('@/widgets/refresh') as typeof import('@/widgets/refresh');
    const { syncReminders } = require('@/lib/reminders') as typeof import('@/lib/reminders');
    // After the debounced settings write has landed.
    setTimeout(() => {
      void refreshWidgets();
      void syncReminders();
    }, 300);
  } catch {
    // best-effort
  }
}

/** Personal contents (book titles, quotes) may show outside the app. */
export function privateContentAllowed(): boolean {
  const c = useLock.getState().config;
  return !(c.enabled && c.hidePrivate);
}

/** Re-apply "hide in Recents" (it belongs to the window, which Android can
 *  recreate behind our back). */
export function applyRecentsSetting(): void {
  applyRecents(useLock.getState().config);
}

export const useLock = create<LockState>((set, get) => ({
  hydrated: false,
  config: DEFAULT,
  locked: false,
  graceUntil: 0,
  leftAt: 0,
  leftInGrace: false,

  hydrate: async () => {
    // Once per process: the root layout can remount (a deep link into the
    // running app), and re-reading here would lock an app just unlocked.
    if (get().hydrated) return;
    let config = DEFAULT;
    // A transient read error must not open a locked app: retry once.
    const read = () => AsyncStorage.getItem(STORAGE_KEY);
    try {
      const raw = await read().catch(read);
      if (raw) {
        const p = JSON.parse(raw) as Partial<LockConfig>;
        config = { ...DEFAULT, ...p };
        // A config without a usable PIN can't be unlocked: treat it as off.
        if (config.enabled && (!config.hash || !config.salt)) config = { ...config, enabled: false };
      }
    } catch {
      // defaults (unlocked)
    }
    // A PIN pause that spanned a reboot restarts (the monotonic clock did).
    if (config.blockedFor) {
      const now = monotonicClock();
      if (now.boot !== config.blockedBoot) {
        config = { ...config, blockedBoot: now.boot, blockedUntil: now.elapsed + config.blockedFor };
        persist(config);
      }
    }
    // Cold start: a locked app opens on the lock screen.
    set({ config, hydrated: true, locked: config.enabled });
    applyRecents(config);
  },

  enable: async (pin) => {
    if (!isValidPin(pin)) return false;
    const salt = newSalt();
    const config: LockConfig = {
      ...get().config,
      enabled: true,
      salt,
      hash: hashPin(pin, salt),
      pinLength: pin.length,
      failures: 0,
      blockedUntil: 0,
      blockedFor: 0,
      blockedBoot: 0,
    };
    // The user must never believe the app is locked when it isn't saved.
    if (!(await persistNow(config))) return false;
    set({ config });
    applyRecents(config);
    refreshPlacedWidgets();
    return true;
  },

  disable: async () => {
    const config: LockConfig = {
      ...DEFAULT,
      timeoutSec: get().config.timeoutSec,
      hideRecents: get().config.hideRecents,
      hidePrivate: get().config.hidePrivate,
    };
    if (!(await persistNow(config))) return false;
    set({ config, locked: false });
    applyRecents(config);
    refreshPlacedWidgets();
    return true;
  },

  changePin: async (pin) => {
    if (!isValidPin(pin)) return false;
    const salt = newSalt();
    const config: LockConfig = { ...get().config, salt, hash: hashPin(pin, salt), pinLength: pin.length };
    if (!(await persistNow(config))) return false;
    set({ config });
    return true;
  },

  update: (patch) => {
    const config = { ...get().config, ...patch };
    set({ config });
    persist(config);
    applyRecents(config);
    if ('hidePrivate' in patch) refreshPlacedWidgets();
  },

  tryPin: (pin) => attemptPin(pin, () => set({ locked: false })),

  // Same throttling as the lock screen: settings must not become a place to
  // try every PIN.
  checkPin: (pin) => attemptPin(pin, () => {}),

  unlock: () => {
    const c = get().config;
    if (c.failures) {
      const config = { ...c, failures: 0, blockedUntil: 0, blockedFor: 0 };
      set({ config });
      persist(config);
    }
    set({ locked: false });
  },

  lock: () => {
    if (get().config.enabled) set({ locked: true });
  },

  allowExternal: (ms = 10 * 60_000) => set({ graceUntil: monotonicClock().elapsed + ms }),

  blockedMs: () => {
    const c = get().config;
    if (!c.blockedFor) return 0;
    const now = monotonicClock();
    // Rebooted since the pause began (re-armed by hydrate): the full pause.
    if (now.boot !== c.blockedBoot) return c.blockedFor;
    return Math.max(0, Math.min(c.blockedFor, c.blockedUntil - now.elapsed));
  },

  markLeft: () => {
    const now = monotonicClock().elapsed;
    set({ leftAt: now, leftInGrace: now < get().graceUntil });
  },

  markBack: () => {
    const s = get();
    const away = s.leftAt ? monotonicClock().elapsed - s.leftAt : 0;
    const lock = !s.locked && s.leftAt > 0 && shouldLock(s.config, away, s.leftInGrace);
    set({ leftAt: 0, leftInGrace: false, graceUntil: 0, ...(lock ? { locked: true } : {}) });
    return lock;
  },
}));

function failed(c: LockConfig): LockConfig {
  const failures = c.failures + 1;
  const wait = lockoutMs(failures);
  if (!wait) return { ...c, failures };
  const now = monotonicClock();
  return { ...c, failures, blockedUntil: now.elapsed + wait, blockedBoot: now.boot, blockedFor: wait };
}

/** Run something that leaves the app (picker, share sheet, permission prompt)
 *  without the lock kicking in on the way back. */
export async function withLockGrace<T>(fn: () => Promise<T>): Promise<T> {
  useLock.getState().allowExternal();
  try {
    return await fn();
  } finally {
    graceTail();
  }
}

/** Back from something external: a short tail covers the activity-resume
 *  transition - unless the app is already back (then there's nothing left to
 *  cover, and a tail would only excuse the next real exit). */
export function graceTail(): void {
  const s = useLock.getState();
  if (s.leftAt || s.graceUntil) s.allowExternal(3_000);
}
