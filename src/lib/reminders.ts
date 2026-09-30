import { AppState } from 'react-native';
import { useSettings } from '@/store/useSettings';
import { useStore } from '@/store/useStore';
import { resolveLang, translate } from '@/i18n';
import { computeStats } from '@/lib/stats';
import { toDateKey } from '@/lib/utils';
import { reminderDays } from '@/lib/reminderPlan';
import { cancelReminders, ReminderItem, scheduleReminders } from '@/lib/notifications';
import { privateContentAllowed } from '@/store/useLock';
import type { Book, ReadingSession } from '@/types';

// Syncs run one at a time: two interleaved "cancel all + schedule" passes
// (launch, settings screen, backgrounding) could leave a stale plan behind.
let chain: Promise<unknown> = Promise.resolve();
/**
 * (Re)plan the reading reminders from the current settings and library.
 *
 * "Skip days I've read" can't be a repeating alarm - there's no condition on
 * those - so it is a month of one-off reminders, re-planned whenever the app
 * runs and whenever today's first session is saved (which drops today's).
 * Today's reminder is personal: your streak at stake, or the book you're in.
 */
export function syncReminders(): Promise<boolean> {
  const run = chain.then(syncOnce, syncOnce);
  chain = run.catch(() => undefined);
  return run;
}

async function syncOnce(): Promise<boolean> {
  const st = useSettings.getState();
  const lang = resolveLang(st.language);
  const tr = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  const channel = tr('notif.channelReminders');
  if (!st.reminderEnabled) {
    await cancelReminders();
    return true;
  }

  const { books, sessions } = useStore.getState();
  // With the app lock on, the lock screen must not show what you're reading.
  const reading = !privateContentAllowed() ? undefined : mostRecentlyRead(books, sessions);

  const generic = reading
    ? { title: tr('notif.title'), body: tr('notif.bodyBook', { title: reading.title, page: reading.currentPage }) }
    : { title: tr('notif.title'), body: tr('notif.body') };

  if (!st.reminderSmart) {
    const ok = await scheduleReminders({ daily: { hour: st.reminderHour, minute: st.reminderMinute, ...generic } }, channel);
    if (!useSettings.getState().reminderEnabled) await cancelReminders();
    return ok;
  }

  const today = toDateKey();
  const readToday = sessions.some((s) => s.date === today);
  const streak = computeStats(books, sessions).currentStreak;
  // The streak is known for the next reminder only: today's, or - once today
  // is read - tomorrow's (the plan is redone whenever the app runs).
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const streakDay = readToday ? toDateKey(tomorrow.getTime()) : today;
  const items: ReminderItem[] = reminderDays(st.reminderHour, st.reminderMinute, readToday).map((d) => {
    if (d.day === streakDay && streak > 0) {
      return {
        ...d,
        title: tr('notif.streakTitle', { n: streak }),
        body: reading ? tr('notif.streakBodyBook', { title: reading.title }) : tr('notif.streakBody'),
      };
    }
    return { ...d, ...generic };
  });
  const ok = await scheduleReminders({ items }, channel);
  // Turned off while we were scheduling: undo.
  if (!useSettings.getState().reminderEnabled) await cancelReminders();
  return ok;
}

/** The reading book with the latest session end (first in library order on
 *  a tie). One pass over the sessions - not one per comparison. */
function mostRecentlyRead(books: Book[], sessions: ReadingSession[]): Book | undefined {
  const reading = books.filter((b) => b.status === 'reading');
  if (reading.length === 0) return undefined;
  const lastEnd = new Map<string, number>();
  for (const s of sessions) if (s.endTime > (lastEnd.get(s.bookId) ?? 0)) lastEnd.set(s.bookId, s.endTime);
  return reading.sort((a, b) => (lastEnd.get(b.id) ?? 0) - (lastEnd.get(a.id) ?? 0))[0];
}

// Keep the plan current: re-plan when today's first session lands (so today's
// reminder disappears) and when the app goes to the background.
let lastDayWithRead = '';
let armed = false;
export function watchReminders(): void {
  if (armed) return;
  armed = true;
  useStore.subscribe((s, prev) => {
    if (s.sessions === prev.sessions) return;
    const today = toDateKey();
    if (lastDayWithRead === today) return;
    if (s.sessions.some((x) => x.date === today)) {
      lastDayWithRead = today;
      void syncReminders();
    }
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'background') void syncReminders();
  });
}
