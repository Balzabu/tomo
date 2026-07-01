import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  useActiveSession,
  sessionElapsedAtLastTick,
} from '@/store/useActiveSession';
import { useStore, useBook } from '@/store/useStore';
import { dismissSessionNotification } from '@/lib/notifications';
import { SessionEditor, SessionDraft } from '@/components/SessionEditor';
import { useTranslation } from '@/i18n';

/**
 * App-wide guardian for the active reading session. It:
 *  - routes a notification tap (cold start or warm) to the finish screen, and
 *  - on launch, offers to recover a session orphaned by a process kill, letting
 *    the user confirm/adjust the duration and pages before it's saved.
 * Renders nothing except the recovery editor when needed.
 */
export function ActiveSessionWatcher() {
  const { t: tr } = useTranslation();
  const hydrated = useActiveSession((s) => s.hydrated);
  const active = useActiveSession((s) => s.active);
  const adopted = useActiveSession((s) => s.adopted);
  const clearActive = useActiveSession((s) => s.clear);
  const addSession = useStore((s) => s.addSession);
  const book = useBook(active?.bookId);
  const segments = useSegments();
  const onTimer = (segments as string[]).includes('timer');

  const [ready, setReady] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const promptedRef = useRef(false);
  const navHandledRef = useRef<string | null>(null);

  // Let navigation settle after a cold start before deciding anything.
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(id);
  }, []);

  const discard = () => {
    void dismissSessionNotification(useActiveSession.getState().active?.notificationId);
    clearActive();
  };

  // A notification tap carries the book id - open its finish screen. Tracking
  // this also suppresses the recovery prompt for that launch.
  const lastResponse = Notifications.useLastNotificationResponse();
  const navBookId =
    (lastResponse?.notification?.request?.content?.data?.sessionBookId as string | undefined) ??
    null;
  useEffect(() => {
    if (!ready || !navBookId || navHandledRef.current === navBookId) return;
    navHandledRef.current = navBookId;
    // Tell any already-mounted timer to jump to finish, and only push a new
    // timer screen when one isn't already showing (avoids stacking a duplicate).
    useActiveSession.getState().requestFinish();
    if (!onTimer) {
      router.push({ pathname: '/timer/[bookId]', params: { bookId: navBookId, finish: '1' } });
    }
  }, [ready, navBookId, onTimer]);

  const estMinutes = active ? Math.max(1, Math.round(sessionElapsedAtLastTick(active) / 60)) : 0;

  // Prompt once to recover an orphaned session.
  const canPrompt =
    ready && hydrated && !!active && !adopted && !onTimer && !navBookId && !editorVisible;
  useEffect(() => {
    if (!canPrompt || promptedRef.current) return;
    promptedRef.current = true;
    if (!book) {
      discard(); // book was deleted - nothing to recover
      return;
    }
    Alert.alert(
      tr('timer.recoverTitle'),
      tr('timer.recoverMsg', { title: book.title, n: estMinutes }),
      [
        { text: tr('timer.recoverDiscard'), style: 'destructive', onPress: discard },
        { text: tr('timer.saveSession'), onPress: () => setEditorVisible(true) },
      ]
    );
  }, [canPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaveRecovered = (draft: SessionDraft) => {
    const a = useActiveSession.getState().active;
    if (!a) return;
    // Keep the real start time-of-day, but honour a day change from the picker.
    const orig = new Date(a.startedAt);
    const tod =
      orig.getHours() * 3600000 +
      orig.getMinutes() * 60000 +
      orig.getSeconds() * 1000 +
      orig.getMilliseconds();
    const startedAt = draft.dayTs + tod;
    const durationSeconds = draft.minutes * 60;
    const pagesRead =
      draft.startPage != null && draft.endPage != null
        ? Math.max(0, draft.endPage - draft.startPage)
        : 0;
    addSession({
      bookId: a.bookId,
      startTime: startedAt,
      endTime: startedAt + durationSeconds * 1000,
      durationSeconds,
      startPage: draft.startPage,
      endPage: draft.endPage,
      pagesRead,
    });
    discard();
  };

  if (!editorVisible) return null;
  return (
    <SessionEditor
      visible={editorVisible}
      title={tr('timer.recoverTitle')}
      defaultStartPage={book?.currentPage}
      defaultMinutes={estMinutes}
      defaultDayTs={active?.startedAt}
      onClose={() => {
        setEditorVisible(false);
        discard(); // closing without saving drops the orphan
      }}
      onSave={(draft) => {
        onSaveRecovered(draft);
        setEditorVisible(false);
      }}
    />
  );
}
