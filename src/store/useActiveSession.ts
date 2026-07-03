import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dismissSessionNotification } from '@/lib/notifications';

// A reading session that is currently in progress. Persisted to disk so it
// survives the OS killing the app process while the screen is off - the
// duration is wall-clock based (timestamps), so we can always reconstruct it.
const STORAGE_KEY = 'tomo:activeSession:v1';

export interface ActiveSession {
  bookId: string;
  /** wall-clock ms when the session first started (becomes the session startTime) */
  startedAt: number;
  /** seconds accrued before the current running stretch (summed across pauses) */
  accumulatedSeconds: number;
  /** ms timestamp the current run started, or null while paused/frozen */
  runningSince: number | null;
  /** last moment the foreground confirmed the session was alive (recovery cap) */
  lastTick: number;
  /** id of the ongoing notification, so it can be dismissed when the session ends */
  notificationId?: string;
}

/** Elapsed seconds as of `now`, honouring the running/paused state. */
export function sessionElapsed(s: ActiveSession, now: number): number {
  const live =
    s.runningSince != null ? Math.max(0, Math.floor((now - s.runningSince) / 1000)) : 0;
  return s.accumulatedSeconds + live;
}

/** Elapsed capped at the last confirmed heartbeat - used when recovering an
 *  orphaned session, so time the phone spent idle/killed isn't counted. */
export function sessionElapsedAtLastTick(s: ActiveSession): number {
  const live =
    s.runningSince != null ? Math.max(0, Math.floor((s.lastTick - s.runningSince) / 1000)) : 0;
  return s.accumulatedSeconds + live;
}

interface ActiveSessionState {
  hydrated: boolean;
  active: ActiveSession | null;
  /** set once the timer screen owns the session this launch (suppresses recovery) */
  adopted: boolean;
  /** a "Finish" request (from the notification) for an already-mounted timer */
  finishRequested: boolean;

  hydrate: () => Promise<void>;
  start: (bookId: string) => void;
  pause: () => void;
  resume: () => void;
  tick: () => void;
  setNotificationId: (id: string) => void;
  markAdopted: () => void;
  requestFinish: () => void;
  clearFinishRequest: () => void;
  clear: () => void;
}

function persist(active: ActiveSession | null) {
  // Best-effort: this store's whole purpose is surviving a process kill, so at
  // least leave a trace when the write that would make that possible fails.
  if (active) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active)).catch((e) =>
      console.warn('Failed to persist active session', e)
    );
  } else {
    AsyncStorage.removeItem(STORAGE_KEY).catch((e) =>
      console.warn('Failed to clear active session', e)
    );
  }
}

export const useActiveSession = create<ActiveSessionState>((set, get) => ({
  hydrated: false,
  active: null,
  adopted: false,
  finishRequested: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      // A session started while this read was in flight (e.g. a cold-start
      // deep link straight into the timer) must not be clobbered by the stale
      // persisted copy - the live one is newer by definition.
      if (get().active) {
        set({ hydrated: true });
        return;
      }
      if (raw) {
        const s = JSON.parse(raw) as ActiveSession;
        // Anything read back at launch is an orphan (a live session lives in
        // memory). Freeze it at its last heartbeat so idle/killed time isn't
        // counted, then persist the frozen (paused) state.
        const frozen: ActiveSession = {
          ...s,
          accumulatedSeconds: sessionElapsedAtLastTick(s),
          runningSince: null,
        };
        persist(frozen);
        set({ active: frozen, hydrated: true });
        return;
      }
    } catch (e) {
      console.warn('Failed to load active session', e);
    }
    set({ hydrated: true });
  },

  start: (bookId) => {
    const now = Date.now();
    const active: ActiveSession = {
      bookId,
      startedAt: now,
      accumulatedSeconds: 0,
      runningSince: now,
      lastTick: now,
    };
    set({ active, adopted: true, finishRequested: false });
    persist(active);
  },

  pause: () => {
    const { active } = get();
    if (!active || active.runningSince == null) return;
    const now = Date.now();
    const next: ActiveSession = {
      ...active,
      accumulatedSeconds: sessionElapsed(active, now),
      runningSince: null,
      lastTick: now,
    };
    set({ active: next });
    persist(next);
  },

  resume: () => {
    const { active } = get();
    if (!active || active.runningSince != null) return;
    const now = Date.now();
    const next: ActiveSession = { ...active, runningSince: now, lastTick: now };
    set({ active: next });
    persist(next);
  },

  tick: () => {
    const { active } = get();
    if (!active || active.runningSince == null) return;
    const next: ActiveSession = { ...active, lastTick: Date.now() };
    set({ active: next });
    persist(next);
  },

  setNotificationId: (id) => {
    const { active } = get();
    if (!active) return;
    const next: ActiveSession = { ...active, notificationId: id };
    set({ active: next });
    persist(next);
  },

  markAdopted: () => set({ adopted: true }),

  requestFinish: () => set({ finishRequested: true }),
  clearFinishRequest: () => set({ finishRequested: false }),

  clear: () => {
    // Always dismiss the ongoing notification so no caller can orphan it (e.g.
    // the timer dropping a stray session started for a different book).
    void dismissSessionNotification(get().active?.notificationId);
    set({ active: null, finishRequested: false });
    persist(null);
  },
}));
