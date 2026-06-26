import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { onColor, radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { BookCover } from '@/components/BookCover';
import { formatClock } from '@/lib/utils';

export default function TimerScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const book = useBook(bookId);
  const addSession = useStore((s) => s.addSession);

  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [phase, setPhase] = useState<'timing' | 'finish'>('timing');
  const startRef = useRef<number>(Date.now());
  const baseRef = useRef<number>(0); // seconds accumulated before current run
  const savingRef = useRef(false); // guards against a double "Save" tap
  const allowLeaveRef = useRef(false); // set when leaving intentionally (save/cancel)
  const navigation = useNavigation();
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  // When opened from a widget on a cold start there's no screen to go back to,
  // so router.back() would no-op. Fall back to the book detail in that case.
  const leave = () => {
    allowLeaveRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(`/book/${bookId}`);
  };

  const [startPage, setStartPage] = useState(String(book?.currentPage ?? 0));
  const [endPage, setEndPage] = useState(String(book?.currentPage ?? 0));

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

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
    if (running) {
      baseRef.current = elapsed;
      setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const goToFinish = () => {
    setRunning(false);
    baseRef.current = elapsed;
    setEndPage(String(Math.max(book.currentPage, Number(startPage) || 0)));
    setPhase('finish');
  };

  const save = () => {
    if (savingRef.current) return; // ignore repeated taps
    savingRef.current = true;

    const sp = parseInt(startPage, 10);
    const ep = parseInt(endPage, 10);
    const validStart = Number.isFinite(sp) ? sp : undefined;
    const validEnd = Number.isFinite(ep) ? ep : undefined;
    const pagesRead =
      validStart != null && validEnd != null ? Math.max(0, validEnd - validStart) : 0;

    addSession({
      bookId: book.id,
      startTime: Date.now() - elapsed * 1000,
      endTime: Date.now(),
      durationSeconds: elapsed,
      startPage: validStart,
      endPage: validEnd,
      pagesRead,
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    leave();
  };

  const cancel = () => {
    Alert.alert(tr('timer.cancelTitle'), tr('timer.cancelMsg'), [
      { text: tr('timer.keepReading'), style: 'cancel' },
      { text: tr('timer.cancelConfirm'), style: 'destructive', onPress: leave },
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
