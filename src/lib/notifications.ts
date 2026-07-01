import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'reading-reminders';
const SESSION_CHANNEL_ID = 'reading-session';
const SESSION_CATEGORY_ID = 'reading-session';
const FINISH_ACTION_ID = 'FINISH';

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

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reading reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Ask for notification permission (Android 13+ needs a channel first). */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
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

/**
 * Replace any existing daily reminder with one at the given local time.
 * Returns whether it was scheduled (false if the platform call threw), so the
 * caller can reconcile the "reminder on" setting instead of silently failing.
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  title: string,
  body: string
): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    await cancelReminders();
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel the reading reminder (we only ever schedule this one). */
export async function cancelReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

// --- Reading-session ongoing notification --------------------------------

async function ensureSessionChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SESSION_CHANNEL_ID, {
    name: 'Reading session',
    // LOW: shows in the shade but never makes a sound or heads-up banner.
    importance: Notifications.AndroidImportance.LOW,
  });
}

export interface SessionNotificationText {
  title: string;
  body: string;
  /** label of the "Finish" action button */
  finishLabel: string;
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
    await ensureSessionChannel();
    await Notifications.setNotificationCategoryAsync(SESSION_CATEGORY_ID, [
      {
        identifier: FINISH_ACTION_ID,
        buttonTitle: text.finishLabel,
        options: { opensAppToForeground: true },
      },
    ]);
    return await Notifications.scheduleNotificationAsync({
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
