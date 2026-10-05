import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import { TextInput } from '@/components/ThemedTextInput';
import { Alert } from '@/components/AppAlert';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBook, useStore } from '@/store/useStore';
import {
  useActiveSession,
  sessionElapsed,
  sessionElapsedAtLastTick,
} from '@/store/useActiveSession';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { NoteModal } from '@/components/NoteEditor';
import { useSnackbar } from '@/store/useSnackbar';
import { useLock } from '@/store/useLock';
import { NoteType } from '@/types';
import { BookCover } from '@/components/BookCover';
import { formatClock, formatTimeOfDay, MAX_SESSION_MINUTES, pagesError, parsePageField } from '@/lib/utils';
import { readingDayKey } from '@/lib/readingDay';
import { requestNotificationPermission, dismissSessionNotification } from '@/lib/notifications';
import { postSessionNotification } from '@/lib/sessionNotification';

/** A gap in the heartbeat this long, across a change of reading day, means
 *  the clock was left running (see checkStale). */
const STALE_GAP_MS = 60 * 60_000;

export default function TimerScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { bookId, finish } = useLocalSearchParams<{ bookId: string; finish?: string }>();
  const book = useBook(bookId);
  const addSession = useStore((s) => s.addSession);
  const active = useActiveSession((s) => s.active);
  const finishRequested = useActiveSession((s) => s.finishRequested);
  const captureRequested = useActiveSession((s) => s.captureRequested);
  const addNote = useStore((s) => s.addNote);
  // Quick capture while reading: the clock keeps running behind the dialog.
  const [capture, setCapture] = useState<NoteType | null>(null);
  const [captured, setCaptured] = useState(0);

  const [phase, setPhase] = useState<'timing' | 'finish'>(finish === '1' ? 'finish' : 'timing');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const savingRef = useRef(false); // guards against a double "Save" tap
  const allowLeaveRef = useRef(false); // set when leaving intentionally (save/cancel)
  const initRef = useRef<string | null>(null); // bookId the bootstrap ran for
  const wasRunningRef = useRef(false); // clock state when the finish form opened
  const navigation = useNavigation();

  // Elapsed is derived from the persisted session (wall-clock based), so it is
  // correct after the screen has been off and survives a process restart. Read
  // on demand; only <ElapsedClock> re-renders as it advances.
  const elapsedNow = () => {
    const a = useActiveSession.getState().active;
    return a ? sessionElapsed(a, Date.now()) : 0;
  };
  const running = active?.runningSince != null;

  // When opened from a widget/notification on a cold start there's no screen to
  // go back to, so router.back() would no-op. Fall back to the book detail.
  const leave = () => {
    allowLeaveRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(`/book/${bookId}`);
  };

  // Save an interrupted session (≥ 1 min) as it stood at its last heartbeat.
  const bankSession = (a: NonNullable<ReturnType<typeof useActiveSession.getState>['active']>) => {
    const secs = sessionElapsedAtLastTick(a);
    const exists = useStore.getState().books.some((b) => b.id === a.bookId);
    if (!exists || secs < 60) return;
    addSession({
      bookId: a.bookId,
      startTime: a.startedAt,
      endTime: Math.max(a.startedAt + secs * 1000, a.lastTick),
      durationSeconds: secs,
      pagesRead: 0,
    });
  };

  const discard = () => {
    const s = useActiveSession.getState();
    void dismissSessionNotification(s.active?.notificationId);
    s.clear();
  };

  const [startPage, setStartPage] = useState(String(book?.currentPage ?? 0));
  const [endPage, setEndPage] = useState(String(book?.currentPage ?? 0));

  // Bootstrap the session per book: adopt an existing one for this book, or
  // start a fresh one (and post the ongoing notification). A stale deep link
  // (widget or notification pointing at a deleted book) must not start a ghost
  // session, so nothing happens until the book resolves. Keyed by bookId, not
  // one-shot: a deep link while this screen is mounted swaps the route params
  // in place (React Navigation reuses the route), and skipping the re-run
  // would leave the old book's session on the clock - and record its time
  // against the new book on save.
  const sessionHydrated = useActiveSession((s) => s.hydrated);
  // Opened from a widget or notification while the app is locked: nothing
  // starts (no timer, no notification, no session on disk) until the PIN.
  const lockedNow = useLock((s) => s.locked);
  useEffect(() => {
    if (initRef.current === bookId || !book || !sessionHydrated || lockedNow) return;
    const swapped = initRef.current != null;
    initRef.current = bookId;
    if (swapped) {
      // Reset the per-book UI state before bootstrapping the new session.
      savingRef.current = false;
      setCapture(null);
      setCaptured(0);
      setPhase(finish === '1' ? 'finish' : 'timing');
      setStartPage(String(book.currentPage));
      setEndPage(String(book.currentPage));
    }
    const s = useActiveSession.getState();
    let a = s.active;
    // Yesterday's session for this book (an earlier reading day: left
    // running, or frozen after the app was killed): keep that reading on its
    // own day instead of silently continuing it today, and start fresh.
    if (a && a.bookId === bookId && finish !== '1' && readingDayKey(a.lastTick) !== readingDayKey()) {
      bankSession(a);
      s.clear();
      a = null;
    }
    if (a && a.bookId === bookId) {
      s.markAdopted();
      if (finish === '1') {
        wasRunningRef.current = a.runningSince != null;
        s.pause(); // freeze for the finish screen
      } else s.resume(); // continue an existing session
      return;
    }
    // "Finish" (a notification) for a session that no longer exists: nothing
    // to finish - never start a new one behind the finish form.
    if (finish === '1') {
      allowLeaveRef.current = true;
      router.replace(`/book/${bookId}`);
      return;
    }
    if (a) {
      // A session for another book (e.g. this timer was opened from a widget
      // while one was running). Dropping it silently can destroy real reading
      // time, so bank anything meaningful as a session first - capped at its
      // last heartbeat, the same way the recovery flow measures it.
      bankSession(a);
      s.clear();
    }
    s.start(bookId);
    void (async () => {
      const granted = await requestNotificationPermission(tr('notif.channelReminders'));
      if (!granted) return;
      const startedAt = useActiveSession.getState().active?.startedAt ?? Date.now();
      const id = await postSessionNotification(tr, bookId, book.title, startedAt);
      if (!id) return;
      // The session may have been discarded (or replaced) while the permission
      // prompt / notification post was in flight - dismiss the notification
      // right away instead of orphaning it in the shade.
      if (useActiveSession.getState().active?.bookId !== bookId) {
        void dismissSessionNotification(id);
        return;
      }
      useActiveSession.getState().setNotificationId(id);
    })();
  }, [bookId, finish, book, tr, sessionHydrated, lockedNow]);

  // A "Finish" tap on the notification while the timer is already mounted: jump
  // to the finish screen instead of stacking a second timer. Waits while a
  // quote is being typed (switching would throw the text away).
  useEffect(() => {
    // Nothing changes behind the lock screen: handled once unlocked.
    if (!finishRequested || capture !== null || lockedNow) return;
    const s = useActiveSession.getState();
    // Already on the finish form (typed pages, "was running" state): keep it.
    if (phaseRef.current === 'finish') {
      s.clearFinishRequest();
      return;
    }
    wasRunningRef.current = s.active?.runningSince != null;
    s.pause();
    s.clearFinishRequest();
    setEndPage(String(Math.max(book?.currentPage ?? 0, Number(startPage) || 0)));
    setPhase('finish');
  }, [finishRequested, capture, lockedNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Add quote" tapped on the ongoing notification - opened only once the
  // lock screen (if any) is gone, never on top of it.
  const appLocked = useLock((s) => s.locked);
  useEffect(() => {
    if (!captureRequested || appLocked) return;
    useActiveSession.getState().clearCaptureRequest();
    if (phase === 'timing') setCapture('quote');
  }, [captureRequested, appLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // An occasional heartbeat so a kill-recovery knows how far the session got
  // (throttled to keep disk writes rare). Only while the app is in front (it
  // also ticks when it leaves, below): a heartbeat in the background would
  // hide a clock left running overnight from checkStale. After a gap that
  // long it waits for checkStale too, which runs once the lock is decided and
  // ticks itself when the gap was fine - the interval can fire first on
  // resume and would otherwise erase the gap it's asking about.
  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const s = useActiveSession.getState();
      const a = s.active;
      if (a?.runningSince == null) return;
      const gap = Date.now() - a.lastTick;
      if (gap > 15_000 && gap < STALE_GAP_MS) s.tick();
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  // The clock was left running overnight (the app stayed alive in the
  // background): ask how much of that was reading instead of silently counting
  // the whole night - stopped at the last activity until the user says so.
  const checkStale = () => {
    const s = useActiveSession.getState();
    const a = s.active;
    if (!a || a.bookId !== bookId || a.runningSince == null || phaseRef.current !== 'timing') return;
    if (useLock.getState().locked) return;
    // A new day *and* a real gap: reading from 23:55 past midnight is fine -
    // then catch the heartbeat up, which held back for this answer.
    if (readingDayKey(a.lastTick) === readingDayKey() || Date.now() - a.lastTick < STALE_GAP_MS) {
      if (AppState.currentState === 'active') s.tick();
      return;
    }
    const tickSecs = sessionElapsedAtLastTick(a);
    const nowSecs = Math.min(MAX_SESSION_MINUTES * 60, sessionElapsed(a, Date.now()));
    s.pauseAtLastTick();
    const toFinish = (secs: number) => {
      useActiveSession.getState().setElapsed(secs);
      wasRunningRef.current = false;
      setEndPage(String(Math.max(book?.currentPage ?? 0, Number(startPage) || 0)));
      setPhase('finish');
    };
    Alert.alert(
      tr('timer.staleTitle'),
      tr('timer.staleMsg', { time: formatTimeOfDay(a.lastTick) }),
      [
        { text: tr('timer.recoverSaveNow', { n: Math.max(1, Math.round(nowSecs / 60)) }), onPress: () => toFinish(nowSecs) },
        { text: tr('timer.recoverSaveTick', { n: Math.max(1, Math.round(tickSecs / 60)) }), onPress: () => toFinish(tickSecs) },
      ],
      { cancelable: false }
    );
  };
  const checkStaleRef = useRef(checkStale);
  checkStaleRef.current = checkStale;
  useEffect(() => {
    if (!lockedNow) checkStaleRef.current();
  }, [lockedNow]);

  // Record a heartbeat the moment we go to the background (the most likely point
  // just before the OS freezes/kills the process).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') useActiveSession.getState().tick();
      else setTimeout(() => checkStaleRef.current(), 300); // after the lock decision
    });
    return () => sub.remove();
  }, []);

  // Guard hardware back / swipe-back while a session is in progress. Only a
  // session this screen owns is guarded (a stray one for another book is the
  // recovery flow's business, not ours).
  useEffect(() => {
    const sub = (navigation as any).addListener('beforeRemove', (e: any) => {
      if (allowLeaveRef.current) return;
      if (useActiveSession.getState().active?.bookId !== bookId) return;
      if (elapsedNow() <= 0) {
        // Nothing timed yet (backed out within the first second): drop the
        // just-started session instead of leaving it running forever.
        discard();
        return;
      }
      e.preventDefault();
      Alert.alert(tr('timer.cancelTitle'), tr('timer.cancelMsg'), [
        { text: tr('timer.keepReading'), style: 'cancel' },
        {
          text: tr('timer.cancelConfirm'),
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            discard();
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return sub;
  }, [navigation, tr, bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
        <Text style={{ color: t.colors.text }}>{tr('book.notFound')}</Text>
      </View>
    );
  }

  const toggle = () => {
    void Haptics.selectionAsync();
    const s = useActiveSession.getState();
    if (s.active?.runningSince != null) s.pause();
    else s.resume();
  };

  const goToFinish = () => {
    wasRunningRef.current = useActiveSession.getState().active?.runningSince != null;
    useActiveSession.getState().pause();
    setEndPage(String(Math.max(book.currentPage, Number(startPage) || 0)));
    setPhase('finish');
  };

  const save = () => {
    if (savingRef.current) return; // ignore repeated taps
    savingRef.current = true;
    const elapsed = Math.min(elapsedNow(), MAX_SESSION_MINUTES * 60);

    // Nothing timed (e.g. an empty/stale timer): just leave, don't record it.
    if (elapsed <= 0) {
      discard();
      leave();
      return;
    }

    const a = useActiveSession.getState().active;
    const startedAt = a?.startedAt ?? Date.now() - elapsed * 1000;
    const validStart = parsePageField(startPage);
    const validEnd = parsePageField(endPage);
    if (pagesError(validStart, validEnd, book.pageCount)) {
      savingRef.current = false; // the form shows the error; let the user fix it
      return;
    }
    const pagesRead =
      validStart != null && validEnd != null ? Math.max(0, validEnd - validStart) : 0;

    const wasFinished = book.status === 'finished';
    // The session counts for the reading day it started on; its end is when
    // the clock stopped, not start + duration (pauses add wall-clock time).
    const stoppedAt = a?.runningSince != null ? Date.now() : a?.lastTick ?? Date.now();
    addSession({
      bookId: book.id,
      startTime: startedAt,
      endTime: Math.max(startedAt + elapsed * 1000, stoppedAt),
      durationSeconds: elapsed,
      startPage: validStart,
      endPage: validEnd,
      pagesRead,
    });
    discard();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // This session finished the book: offer the reading memory. When the
    // book's own page is underneath it notices the change and offers it.
    const nowFinished = useStore.getState().books.find((b) => b.id === book.id)?.status === 'finished';
    const routes = (navigation as any).getState?.()?.routes ?? [];
    const under = routes[routes.length - 2];
    const detailBelow = under?.name === 'book/[id]' && under?.params?.id === book.id;
    if (!wasFinished && nowFinished && !detailBelow) {
      useSnackbar.getState().show(tr('memory.finished'), {
        actionLabel: tr('memory.create'),
        onAction: () => router.push(`/book/${book.id}?memory=1`),
      });
    }
    leave();
  };

  const cancel = () => {
    Alert.alert(tr('timer.cancelTitle'), tr('timer.cancelMsg'), [
      { text: tr('timer.keepReading'), style: 'cancel' },
      {
        text: tr('timer.cancelConfirm'),
        style: 'destructive',
        onPress: () => {
          discard();
          leave();
        },
      },
    ]);
  };

  if (phase === 'finish') {
    const pageErr = pagesError(parsePageField(startPage), parsePageField(endPage), book.pageCount);
    return (
      <View style={[styles.wrap, { backgroundColor: t.colors.bg }]}>
        <View style={styles.finishHead}>
          <Ionicons name="checkmark-circle" size={48} color={t.colors.success} />
          <ElapsedClock style={[styles.bigTime, { color: t.colors.text }]} />
          <Text style={[styles.sub, { color: t.colors.textMuted }]}>{tr('timer.ofReading')}</Text>
        </View>

        <View style={styles.pageInputs}>
          <PageField label={tr('timer.fromPage')} value={startPage} onChange={setStartPage} t={t} />
          <View style={styles.arrowSlot}>
            <View style={[styles.arrow, { backgroundColor: t.colors.cardAlt }]}>
              <Ionicons name="arrow-forward" size={18} color={t.colors.textMuted} />
            </View>
          </View>
          <PageField label={tr('timer.toPage')} value={endPage} onChange={setEndPage} t={t} />
        </View>
        {pageErr ? (
          <Text style={[styles.totalPages, { color: t.colors.danger, fontWeight: '600' }]}>
            {pageErr === 'order'
              ? tr('session.pageOrder')
              : tr('session.pageRange', { n: book.pageCount ?? 0 })}
          </Text>
        ) : book.pageCount ? (
          <Text style={[styles.totalPages, { color: t.colors.textFaint }]}>
            {tr('timer.ofPages', { n: book.pageCount })}
          </Text>
        ) : null}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Button label={tr('timer.saveSession')} icon="save" full disabled={!!pageErr} onPress={save} />
          <Button
            label={tr('common.back')}
            variant="ghost"
            full
            onPress={() => {
              // goToFinish paused the clock; going back means "keep reading" -
              // unless the user had paused it themselves before tapping Finish.
              if (wasRunningRef.current) useActiveSession.getState().resume();
              setPhase('timing');
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: t.colors.bg }]}>
      <View style={styles.bookHead}>
        <BookCover uri={book.coverUrl} title={book.title} width={90} />
        <Text numberOfLines={2} style={[styles.bookTitle, { color: t.colors.text }]}>
          {book.title}
        </Text>
      </View>

      <ElapsedClock style={[styles.timer, { color: t.colors.text }]} />

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={running ? tr('timer.paused') : tr('timer.reading')}
        style={[styles.playBtn, { backgroundColor: t.colors.primary }]}
      >
        <Ionicons name={running ? 'pause' : 'play'} size={42} color={onColor(t.colors.primary)} />
      </Pressable>
      <Text style={[styles.runState, { color: t.colors.textMuted }]}>
        {running ? tr('timer.reading') : tr('timer.paused')}
      </Text>

      <View style={styles.captureRow}>
        <Button label={tr('notes.kind.quote')} icon="chatbox-ellipses-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setCapture('quote')} />
        <Button label={tr('notes.kind.note')} icon="create-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setCapture('note')} />
      </View>
      {captured > 0 ? (
        <Text style={[styles.captured, { color: t.colors.success }]}>
          {tr('timer.captured', { n: captured })}
        </Text>
      ) : null}

      <View style={{ gap: spacing.md, marginTop: spacing.xl, alignSelf: 'stretch' }}>
        <Button label={tr('timer.finishSave')} icon="flag" full onPress={goToFinish} />
        <Button label={tr('timer.cancel')} variant="ghost" full onPress={cancel} />
      </View>

      <NoteModal
        open={capture !== null}
        type={capture ?? 'quote'}
        defaultPage={Math.max(book.currentPage, parsePageField(startPage) ?? 0) || undefined}
        subtitle={book.title}
        onClose={() => setCapture(null)}
        onSave={(text, page, type) => {
          if (text.trim()) {
            addNote({ bookId: book.id, type, text: text.trim(), page });
            setCaptured((n) => n + 1);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useSnackbar.getState().show(type === 'quote' ? tr('notes.quoteSaved') : tr('notes.noteSaved'));
          }
          setCapture(null);
        }}
      />
    </View>
  );
}

function PageField({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Text style={[styles.pageLabel, { color: t.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
        style={[
          styles.pageInput,
          { backgroundColor: t.colors.card, borderColor: t.colors.border, color: t.colors.text },
        ]}
      />
    </View>
  );
}

/** The running clock. Re-renders only itself, once per displayed second. */
function ElapsedClock({ style }: { style: StyleProp<TextStyle> }) {
  const active = useActiveSession((s) => s.active);
  const [, force] = useState(0);
  const running = active?.runningSince != null;
  useEffect(() => {
    if (!running) return;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      const a = useActiveSession.getState().active;
      if (!a || a.runningSince == null) return;
      force((n) => (n + 1) % 1_000_000);
      // Wake up right after the next whole second of elapsed time.
      id = setTimeout(next, 1000 - ((Date.now() - a.runningSince) % 1000) + 20);
    };
    next();
    return () => clearTimeout(id);
  }, [running, active?.runningSince]);
  return <Text style={style}>{formatClock(active ? sessionElapsed(active, Date.now()) : 0)}</Text>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bookHead: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  bookTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', maxWidth: 260 },
  timer: {
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  playBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  runState: { marginTop: spacing.md, fontSize: 14, fontWeight: '600' },
  captureRow: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.xl },
  captured: { marginTop: spacing.sm, fontSize: 13, fontWeight: '600' },
  finishHead: { alignItems: 'center', gap: 4, marginBottom: spacing.xl },
  bigTime: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 14 },
  pageInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  arrowSlot: { height: 56, justifyContent: 'center' },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pageLabel: { fontSize: 13, fontWeight: '600' },
  pageInput: {
    width: 96,
    height: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  totalPages: { marginTop: spacing.sm, fontSize: 13 },
});
