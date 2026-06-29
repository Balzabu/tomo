import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBook, useStore } from '@/store/useStore';
import { useActiveSession, sessionElapsed } from '@/store/useActiveSession';
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { BookCover } from '@/components/BookCover';
import { formatClock, formatTimeOfDay } from '@/lib/utils';
import {
  requestNotificationPermission,
  showSessionNotification,
  dismissSessionNotification,
} from '@/lib/notifications';

export default function TimerScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { bookId, finish } = useLocalSearchParams<{ bookId: string; finish?: string }>();
  const book = useBook(bookId);
  const addSession = useStore((s) => s.addSession);
  const active = useActiveSession((s) => s.active);
  const finishRequested = useActiveSession((s) => s.finishRequested);

  const [phase, setPhase] = useState<'timing' | 'finish'>(finish === '1' ? 'finish' : 'timing');
  const [, force] = useState(0); // drives the per-tick clock re-render
  const savingRef = useRef(false); // guards against a double "Save" tap
  const allowLeaveRef = useRef(false); // set when leaving intentionally (save/cancel)
  const initRef = useRef(false); // one-shot session bootstrap guard
  const navigation = useNavigation();

  // Elapsed is derived from the persisted session (wall-clock based), so it is
  // correct after the screen has been off and survives a process restart.
  const elapsed = active ? sessionElapsed(active, Date.now()) : 0;
  const running = active?.runningSince != null;
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  // When opened from a widget/notification on a cold start there's no screen to
  // go back to, so router.back() would no-op. Fall back to the book detail.
  const leave = () => {
    allowLeaveRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(`/book/${bookId}`);
  };

  const discard = () => {
    const s = useActiveSession.getState();
    void dismissSessionNotification(s.active?.notificationId);
    s.clear();
  };

  const [startPage, setStartPage] = useState(String(book?.currentPage ?? 0));
  const [endPage, setEndPage] = useState(String(book?.currentPage ?? 0));

  // Bootstrap the session once: adopt an existing one for this book, or start a
  // fresh one (and post the ongoing notification).
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const s = useActiveSession.getState();
    const a = s.active;
    if (a && a.bookId === bookId) {
      s.markAdopted();
      if (finish === '1') s.pause(); // freeze for the finish screen
      else s.resume(); // continue an existing session
      return;
    }
    if (a) s.clear(); // stray session for another book - drop it
    s.start(bookId);
    void (async () => {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      const startedAt = useActiveSession.getState().active?.startedAt ?? Date.now();
      const id = await showSessionNotification(
        {
          title: tr('timer.notifTitle', { title: book?.title ?? '' }),
          body: tr('timer.notifBody', { time: formatTimeOfDay(startedAt) }),
          finishLabel: tr('timer.notifFinish'),
        },
        bookId
      );
      if (id) useActiveSession.getState().setNotificationId(id);
    })();
  }, [bookId, finish, book?.title, tr]);

  // A "Finish" tap on the notification while the timer is already mounted: jump
  // to the finish screen instead of stacking a second timer.
  useEffect(() => {
    if (!finishRequested) return;
    const s = useActiveSession.getState();
    s.pause();
    s.clearFinishRequest();
    setEndPage(String(Math.max(book?.currentPage ?? 0, Number(startPage) || 0)));
    setPhase('finish');
  }, [finishRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth clock + an occasional heartbeat so a kill-recovery knows how far the
  // session got (the heartbeat is throttled to keep disk writes rare).
  useEffect(() => {
    const id = setInterval(() => {
      force((n) => (n + 1) % 1_000_000);
      const s = useActiveSession.getState();
      const a = s.active;
      if (a?.runningSince != null && Date.now() - a.lastTick > 15_000) s.tick();
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Record a heartbeat the moment we go to the background (the most likely point
  // just before the OS freezes/kills the process).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') useActiveSession.getState().tick();
    });
    return () => sub.remove();
  }, []);

  // Guard hardware back / swipe-back while a session is in progress.
  useEffect(() => {
    const sub = (navigation as any).addListener('beforeRemove', (e: any) => {
      if (allowLeaveRef.current || elapsedRef.current <= 0) return;
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
  }, [navigation, tr]);

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
    useActiveSession.getState().pause();
    setEndPage(String(Math.max(book.currentPage, Number(startPage) || 0)));
    setPhase('finish');
  };

  const save = () => {
    if (savingRef.current) return; // ignore repeated taps
    savingRef.current = true;

    // Nothing timed (e.g. an empty/stale timer): just leave, don't record it.
    if (elapsed <= 0) {
      discard();
      leave();
      return;
    }

    const a = useActiveSession.getState().active;
    const startedAt = a?.startedAt ?? Date.now() - elapsed * 1000;
    const sp = parseInt(startPage, 10);
    const ep = parseInt(endPage, 10);
    const validStart = Number.isFinite(sp) ? sp : undefined;
    const validEnd = Number.isFinite(ep) ? ep : undefined;
    const pagesRead =
      validStart != null && validEnd != null ? Math.max(0, validEnd - validStart) : 0;

    addSession({
      bookId: book.id,
      startTime: startedAt,
      endTime: startedAt + elapsed * 1000,
      durationSeconds: elapsed,
      startPage: validStart,
      endPage: validEnd,
      pagesRead,
    });
    discard();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    return (
      <View style={[styles.wrap, { backgroundColor: t.colors.bg }]}>
        <View style={styles.finishHead}>
          <Ionicons name="checkmark-circle" size={48} color={t.colors.success} />
          <Text style={[styles.bigTime, { color: t.colors.text }]}>{formatClock(elapsed)}</Text>
          <Text style={[styles.sub, { color: t.colors.textMuted }]}>{tr('timer.ofReading')}</Text>
        </View>

        <View style={styles.pageInputs}>
          <PageField label={tr('timer.fromPage')} value={startPage} onChange={setStartPage} t={t} />
          <Ionicons name="arrow-forward" size={20} color={t.colors.textFaint} />
          <PageField label={tr('timer.toPage')} value={endPage} onChange={setEndPage} t={t} />
        </View>
        {book.pageCount ? (
          <Text style={[styles.totalPages, { color: t.colors.textFaint }]}>
            {tr('timer.ofPages', { n: book.pageCount })}
          </Text>
        ) : null}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Button label={tr('timer.saveSession')} icon="save" full onPress={save} />
          <Button label={tr('common.back')} variant="ghost" full onPress={() => setPhase('timing')} />
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

      <Text style={[styles.timer, { color: t.colors.text }]}>{formatClock(elapsed)}</Text>

      <Pressable
        onPress={toggle}
        style={[styles.playBtn, { backgroundColor: t.colors.primary }]}
      >
        <Ionicons name={running ? 'pause' : 'play'} size={42} color={onColor(t.colors.primary)} />
      </Pressable>
      <Text style={[styles.runState, { color: t.colors.textMuted }]}>
        {running ? tr('timer.reading') : tr('timer.paused')}
      </Text>

      <View style={{ gap: spacing.md, marginTop: spacing.xxl, alignSelf: 'stretch' }}>
        <Button label={tr('timer.finishSave')} icon="flag" full onPress={goToFinish} />
        <Button label={tr('timer.cancel')} variant="ghost" full onPress={cancel} />
      </View>
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
  finishHead: { alignItems: 'center', gap: 4, marginBottom: spacing.xl },
  bigTime: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 14 },
  pageInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg },
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
