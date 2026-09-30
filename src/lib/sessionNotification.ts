import type { TFunc } from '@/i18n';
import { privateContentAllowed } from '@/store/useLock';
import { formatTimeOfDay } from '@/lib/utils';
import { showSessionNotification } from '@/lib/notifications';

/**
 * Post (or re-post, replacing it in place) the ongoing notification of a
 * reading session. With the lock hiding personal content, the title doesn't
 * name the book - the notification shows on the device's lock screen.
 */
export function postSessionNotification(
  tr: TFunc,
  bookId: string,
  bookTitle: string,
  startedAt: number
): Promise<string | undefined> {
  return showSessionNotification(
    {
      title: privateContentAllowed()
        ? tr('timer.notifTitle', { title: bookTitle })
        : tr('timer.notifTitlePrivate'),
      body: tr('timer.notifBody', { time: formatTimeOfDay(startedAt) }),
      finishLabel: tr('timer.notifFinish'),
      quoteLabel: tr('timer.notifQuote'),
      channelName: tr('notif.channelSession'),
    },
    bookId
  );
}
