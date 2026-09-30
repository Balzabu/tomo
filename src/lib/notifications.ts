import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { withLockGrace } from '@/store/useLock';

const CHANNEL_ID = 'reading-reminders';
const SESSION_CHANNEL_ID = 'reading-session';
const SESSION_CATEGORY_ID = 'reading-session';
const FINISH_ACTION_ID = 'FINISH';
export const QUOTE_ACTION_ID = 'QUOTE';

// Show reminders even when the app is in the foreground. The ongoing session
// notification stays in the shade but doesn't pop a banner over the timer.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isSession = notification.request.content.data?.sessionBookId != null;
    return {
      shouldShowBanner: !isSession,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

// Channel names show up in the system notification settings, so they are
// passed in already-translated like every other string in this module. Android
// updates an existing channel's name on re-registration, so a language switch
// propagates the next time a notification is scheduled.
async function ensureAndroidChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Ask for notification permission (Android 13+ needs a channel first). */
export async function requestNotificationPermission(channelName: string): Promise<boolean> {
  try {
    await ensureAndroidChannel(channelName);
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const req = await withLockGrace(() => Notifications.requestPermissionsAsync());
    return req.granted;
  } catch {
    return false;
  }
}

/** Whether notifications are currently permitted (checks, never prompts). */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted;
  } catch {
    return false;
  }
}

const REMINDER_PREFIX = 'reminder-';

export interface ReminderItem {
  /** local day key, used in the notification id */
  day: string;
  date: Date;
  title: string;
  body: string;
}

/**
 * Replace the scheduled reminders. `items` = one-off reminders for specific
 * days (the "skip days you've read" mode, re-planned whenever the app runs);
 * `daily` = a single repeating reminder. Returns whether scheduling worked, so
 * the caller can reconcile the "reminder on" setting instead of silently
 * failing.
 */
export async function scheduleReminders(
  plan: { items: ReminderItem[] } | { daily: { hour: number; minute: number; title: string; body: string } },
  channelName: string
): Promise<boolean> {
  try {
    await ensureAndroidChannel(channelName);
    await cancelReminders();
    if ('daily' in plan) {
      const { hour, minute, title, body } = plan.daily;
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_PREFIX}daily`,
        content: { title, body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: CHANNEL_ID,
        },
      });
      return true;
    }
    for (const it of plan.items) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_PREFIX}${it.day}`,
        content: { title: it.title, body: it.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: it.date, channelId: CHANNEL_ID },
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** Cancel the reading reminders (never anything else we may schedule). */
export async function cancelReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(REMINDER_PREFIX) || !n.identifier.startsWith('session-'))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // ignore
  }
}

/** Upcoming reminder ids (for diagnostics / tests). */
export async function scheduledReminderIds(): Promise<string[]> {
  try {
    return (await Notifications.getAllScheduledNotificationsAsync())
      .map((n) => n.identifier)
      .filter((id) => id.startsWith(REMINDER_PREFIX));
  } catch {
    return [];
  }
}

// --- Reading-session ongoing notification --------------------------------

async function ensureSessionChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SESSION_CHANNEL_ID, {
    name,
    // LOW: shows in the shade but never makes a sound or heads-up banner.
    importance: Notifications.AndroidImportance.LOW,
  });
}

export interface SessionNotificationText {
  title: string;
  body: string;
  /** label of the "Finish" action button */
  finishLabel: string;
  /** label of the "Add quote" action button */
  quoteLabel: string;
  /** name of the Android notification channel (visible in system settings) */
  channelName: string;
}

/**
 * Post the ongoing "reading in progress" notification with a Finish action.
 * All text is passed in already-translated (this module stays i18n-free).
 * `bookId` is carried in the payload so the tap handler can open the finish
 * screen. Returns the notification id so it can be dismissed when done.
 */
export async function showSessionNotification(
  text: SessionNotificationText,
  bookId: string
): Promise<string | undefined> {
  try {
    await ensureSessionChannel(text.channelName);
    await Notifications.setNotificationCategoryAsync(SESSION_CATEGORY_ID, [
      {
        identifier: QUOTE_ACTION_ID,
        buttonTitle: text.quoteLabel,
        options: { opensAppToForeground: true },
      },
      {
        identifier: FINISH_ACTION_ID,
        buttonTitle: text.finishLabel,
        options: { opensAppToForeground: true },
      },
    ]);
    return await Notifications.scheduleNotificationAsync({
      // Deterministic id: a re-post for the same book *replaces* the previous
      // notification instead of stacking a second, un-swipeable one that
      // nothing tracks (e.g. back out of the timer while the first post is
      // still in flight, then immediately restart it).
      identifier: `session-${bookId}`,
      content: {
        title: text.title,
        body: text.body,
        categoryIdentifier: SESSION_CATEGORY_ID,
        sticky: true, // Android: ongoing, not swipe-dismissable
        autoDismiss: false,
        data: { sessionBookId: bookId },
      },
      // A bare { channelId } trigger presents immediately on that channel.
      trigger: Platform.OS === 'android' ? { channelId: SESSION_CHANNEL_ID } : null,
    });
  } catch {
    return undefined;
  }
}

/** Remove the ongoing session notification, if one is showing. */
export async function dismissSessionNotification(id?: string): Promise<void> {
  try {
    if (id) await Notifications.dismissNotificationAsync(id);
  } catch {
    // ignore
  }
}
