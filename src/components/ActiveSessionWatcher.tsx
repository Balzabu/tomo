import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/AppAlert';
import { router, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  ActiveSession,
  useActiveSession,
  sessionElapsedAtLastTick,
} from '@/store/useActiveSession';
import { useStore, useBook } from '@/store/useStore';
import { isLockedOrDue, useLock } from '@/store/useLock';
import { hasPendingLink } from '@/lib/deferredLink';
import { dismissSessionNotification, FINISH_ACTION_ID, QUOTE_ACTION_ID } from '@/lib/notifications';
import { postSessionNotification } from '@/lib/sessionNotification';
import { SessionEditor, SessionDraft } from '@/components/SessionEditor';
import { TFunc, useTranslation } from '@/i18n';
import { MAX_SESSION_MINUTES } from '@/lib/utils';
import { atReadingDay, placeOnReadingDay } from '@/lib/readingDay';

/**
 * Two estimates for a session the heartbeat lost track of (the process was
 * killed): the safe one stops at the last heartbeat (written every 15 s in
 * the foreground and when backgrounding); the generous one counts until now,
 * for the common "phone face-down, screen off, OS killed the app" paper-book
 * session that the heartbeat can't see - capped at the longest session.
 */
export function orphanEstimates(a: ActiveSession, now: number = Date.now()): { tickSeconds: number; untilNowSeconds: number } {
  const tickSeconds = sessionElapsedAtLastTick(a);
  if (a.orphanRunningSince == null) return { tickSeconds, untilNowSeconds: tickSeconds };
  const extra = Math.max(0, now - Math.max(a.orphanRunningSince, a.lastTick)) / 1000;
  return { tickSeconds, untilNowSeconds: Math.min(MAX_SESSION_MINUTES * 60, tickSeconds + extra) };
}

/** The estimates in whole minutes, as the prompts show them (never under a
 *  minute; "until now" only when it adds something). */
export function orphanMinutes(a: ActiveSession, now: number = Date.now()): { tick: number; untilNow: number } {
  const { tickSeconds, untilNowSeconds } = orphanEstimates(a, now);
  const tick = Math.max(1, Math.round(tickSeconds / 60));
  return { tick, untilNow: Math.max(tick, Math.round(untilNowSeconds / 60)) };
}

/**
 * Ask which estimate to keep for an orphaned session: discard it, count
 * until now (offered only when it adds a minute), or the safe one. The timer
 * uses the same prompt when a notification's "Finish" lands on an orphan.
 */
export function askOrphanRecovery(
  tr: TFunc,
  title: string,
  a: ActiveSession,
  on: { discard: () => void; pick: (minutes: number, seconds: number) => void }
): void {
  const { tickSeconds, untilNowSeconds } = orphanEstimates(a);
  const { tick, untilNow } = orphanMinutes(a);
  Alert.alert(
    tr('timer.recoverTitle'),
    `${tr('timer.recoverMsg', { title, n: tick })}\n\n${tr('timer.recoverHint', { n: tick })}`,
    [
      { text: tr('timer.recoverDiscard'), style: 'destructive', onPress: on.discard },
      ...(untilNow > tick
        ? [{ text: tr('timer.recoverSaveNow', { n: untilNow }), onPress: () => on.pick(untilNow, untilNowSeconds) }]
        : []),
      { text: tr('timer.recoverSaveTick', { n: tick }), onPress: () => on.pick(tick, Math.max(60, tickSeconds)) },
    ],
    { cancelable: false }
  );
}

/**
 * App-wide guardian for the active reading session. It:
 *  - routes a notification tap (cold start or warm): Finish to the finish
 *    screen, Quote to the quote editor, the notification itself to the
 *    running timer; and
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
  const appLocked = useLock((s) => s.locked);
  const onTimer = (segments as string[]).includes('timer');

  const [ready, setReady] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const promptedRef = useRef(false);
  const responseHandledRef = useRef(0);
  // Re-check shortly when a tap arrives while the lock is due but not yet up.
  const [, recheck] = useState(0);

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
  const { response: lastResponse, seq: responseSeq } = useNotificationResponse();
  const navBookId =
    (lastResponse?.notification?.request?.content?.data?.sessionBookId as string | undefined) ??
    null;
  const wantsQuote = lastResponse?.actionIdentifier === QUOTE_ACTION_ID;
  const wantsFinish = lastResponse?.actionIdentifier === FINISH_ACTION_ID;
  useEffect(() => {
    // Every tap is its own event (the same notification is tapped again and
    // again: "Quote" twice, "Finish" after going back), handled once.
    if (!ready || !navBookId || responseSeq === 0 || responseHandledRef.current === responseSeq) return;
    // Nothing happens under the lock screen: the tap is handled after unlock.
    // A warm tap can arrive before the resume has put the lock up.
    if (appLocked) return;
    if (isLockedOrDue()) {
      const id = setTimeout(() => recheck((n) => n + 1), 250);
      return () => clearTimeout(id);
    }
    responseHandledRef.current = responseSeq;
    // Consumed: a remount must not replay it.
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    // A stale notification (its session already ended): nothing to act on.
    if (useActiveSession.getState().active?.bookId !== navBookId) return;
    if (wantsQuote) {
      // Capture without stopping the clock: the timer opens the quote editor.
      useActiveSession.getState().requestCapture();
      if (!onTimer) router.push({ pathname: '/timer/[bookId]', params: { bookId: navBookId } });
      return;
    }
    // Only push a new timer screen when one isn't already showing (avoids
    // stacking a duplicate).
    if (wantsFinish) {
      // Tell any already-mounted timer to jump to finish.
      useActiveSession.getState().requestFinish();
      if (!onTimer) {
        router.push({ pathname: '/timer/[bookId]', params: { bookId: navBookId, finish: '1' } });
      }
      return;
    }
    // A tap on the notification itself: back to the running timer, where the
    // quote and note buttons are - stopping the session is the Finish button's
    // job, not a tap's.
    if (!onTimer) router.push({ pathname: '/timer/[bookId]', params: { bookId: navBookId } });
  }); // eslint-disable-line react-hooks/exhaustive-deps -- deduped on responseSeq; re-checked every render

  // The lock's privacy setting changed mid-session: the notification already in
  // the shade must follow (name the book, or stop naming it).
  const privateMode = useLock((s) => s.config.enabled && s.config.hidePrivate);
  const privateModeRef = useRef(privateMode);
  useEffect(() => {
    if (privateModeRef.current === privateMode) return;
    privateModeRef.current = privateMode;
    const a = useActiveSession.getState().active;
    if (!a?.notificationId || !book || book.id !== a.bookId) return;
    void postSessionNotification(tr, a.bookId, book.title, a.startedAt);
  }, [privateMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const estMinutes = active ? orphanMinutes(active).tick : 0;
  // Under a minute, even counting until now, isn't worth a question.
  const tooShort = active ? sessionElapsedAtLastTick(active) < 60 && orphanMinutes(active).untilNow <= 1 : false;
  const [chosenMinutes, setChosenMinutes] = useState(0);

  // Prompt once to recover an orphaned session.
  // A link held back by the lock (a widget's "start reading") may be about to
  // open the timer, which takes the session over: let it land first.
  const canPrompt =
    ready && hydrated && !!active && !adopted && !onTimer && !navBookId && !editorVisible && !appLocked && !hasPendingLink();
  // The session the prompt is about: its buttons act only on that one (the
  // user may start another from a widget while the prompt is still up).
  const promptFor = useRef<string | null>(null);
  const keyOf = (a: { bookId: string; startedAt: number } | null | undefined) => (a ? `${a.bookId}|${a.startedAt}` : null);
  // ...and only while the timer hasn't taken it over in the meantime.
  const stillPrompted = () => {
    const st = useActiveSession.getState();
    return promptFor.current != null && !st.adopted && keyOf(st.active) === promptFor.current;
  };
  useEffect(() => {
    // The session changed (or was adopted) under an open editor: close it.
    if (editorVisible && !stillPrompted()) setEditorVisible(false);
  }, [active, adopted, editorVisible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canPrompt || promptedRef.current) return;
    promptedRef.current = true;
    promptFor.current = keyOf(active);
    if (!book || !active || tooShort) {
      discard(); // book was deleted, or under a minute - nothing to recover
      return;
    }
    askOrphanRecovery(tr, book.title, active, {
      discard: () => stillPrompted() && discard(),
      pick: (minutes) => {
        if (!stillPrompted()) return;
        setChosenMinutes(minutes);
        setEditorVisible(true);
      },
    });
  }, [canPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaveRecovered = (draft: SessionDraft) => {
    const a = useActiveSession.getState().active;
    if (!a || !stillPrompted()) return;
    // Keep the real start time-of-day, but honour a day change from the picker.
    // Built from calendar fields, not `dayTs + fixed offset`: on a
    // DST-transition day a millisecond offset from midnight lands on the
    // wrong wall-clock hour.
    const orig = new Date(a.startedAt);
    const preferred = atReadingDay(draft.dayTs, orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
    const durationSeconds = draft.minutes * 60;
    // Never in the future ("an hour" from 23:30 today ends now at the latest),
    // and still on the chosen reading day.
    const { startTime: startedAt, endTime } = placeOnReadingDay(draft.dayTs, preferred, durationSeconds * 1000);
    const pagesRead =
      draft.startPage != null && draft.endPage != null
        ? Math.max(0, draft.endPage - draft.startPage)
        : 0;
    addSession({
      bookId: a.bookId,
      startTime: startedAt,
      endTime,
      durationSeconds,
      startPage: draft.startPage,
      endPage: draft.endPage,
      pagesRead,
      source: 'timer',
    });
    discard();
  };

  if (!editorVisible) return null;
  return (
    <SessionEditor
      visible={editorVisible}
      title={tr('timer.recoverTitle')}
      defaultStartPage={book?.currentPage}
      pageCount={book?.pageCount}
      defaultMinutes={chosenMinutes || estMinutes}
      defaultDayTs={active?.startedAt}
      onClose={() => {
        // Closing the editor (cancel, tap outside, back) must not silently
        // destroy the session: go back to the prompt, where "discard" is an
        // explicit choice.
        setEditorVisible(false);
        promptedRef.current = false;
      }}
      onSave={(draft) => {
        onSaveRecovered(draft);
        setEditorVisible(false);
      }}
    />
  );
}

/**
 * The latest notification response, updated on *every* tap. Expo's
 * useLastNotificationResponse ignores a second response from the same
 * notification, but the ongoing session notification is posted once and can
 * be tapped several times ("Quote" twice, then "Finish").
 */
function useNotificationResponse(): { response: Notifications.NotificationResponse | null; seq: number } {
  const [state, setState] = useState<{ response: Notifications.NotificationResponse | null; seq: number }>({
    response: null,
    seq: 0,
  });
  useLayoutEffect(() => {
    // Cold start: the tap that launched the app. The listener may deliver that
    // same tap again right after - the only duplicate to drop. (Taps can't be
    // told apart by content: the notification's data and date are fixed when
    // it's posted, so every tap on the same button looks the same.)
    let initial: Notifications.NotificationResponse | null = Notifications.getLastNotificationResponse();
    const same = (a: Notifications.NotificationResponse, b: Notifications.NotificationResponse) =>
      a.notification.request.identifier === b.notification.request.identifier &&
      a.actionIdentifier === b.actionIdentifier;
    if (initial) setState({ response: initial, seq: 1 });
    const t0 = Date.now();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const dup = initial && Date.now() - t0 < 3000 && same(initial, r);
      initial = null;
      if (!dup) setState((s) => ({ response: r, seq: s.seq + 1 }));
    });
    return () => sub.remove();
  }, []);
  return state;
}
