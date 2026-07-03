import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBook, useStore } from '@/store/useStore';
import { useSnackbar } from '@/store/useSnackbar';
import { BookNote, STATUS_ORDER } from '@/types';
import { BookShareModal } from '@/components/BookShareModal';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation, formatDate } from '@/i18n';
import { BookCover } from '@/components/BookCover';
import { Button, Card, Pill, ProgressBar, SectionTitle } from '@/components/ui';
import { RatingStars } from '@/components/RatingStars';
import { QuoteShareModal } from '@/components/QuoteShareModal';
import { SessionEditor, SessionDraft } from '@/components/SessionEditor';
import { Dialog } from '@/components/Dialog';
import { ReadingSession } from '@/types';
import { estimateRemaining } from '@/lib/stats';
import { formatDuration } from '@/lib/utils';

export default function BookDetailScreen() {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useBook(id);
  // Actions have stable identity, so read them once (non-reactive) instead of
  // subscribing the whole screen to every store change; subscribe only to the
  // reactive slices we actually render below.
  const store = useStore.getState();
  const shelves = useStore((s) => s.shelves);
  const showSnackbar = useSnackbar((s) => s.show);
  // Select the raw arrays (stable refs) and filter in useMemo - a selector
  // that returns `.filter(...)` makes a new array every render and sends
  // Zustand's useSyncExternalStore into an infinite getSnapshot loop.
  const allSessions = useStore((s) => s.sessions);
  const allNotes = useStore((s) => s.notes);
  const sessions = useMemo(
    () => allSessions.filter((x) => x.bookId === id),
    [allSessions, id]
  );
  const notes = useMemo(
    () => allNotes.filter((x) => x.bookId === id),
    [allNotes, id]
  );
  // Sorted copies (never mutate the memoized arrays in place).
  const notesSorted = useMemo(
    () => notes.slice().sort((a, b) => (b.page ?? 0) - (a.page ?? 0)),
    [notes]
  );
  const sessionsSorted = useMemo(
    () => sessions.slice().sort((a, b) => b.startTime - a.startTime),
    [sessions]
  );

  const [progressOpen, setProgressOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState<null | 'note' | 'quote'>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [shareNote, setShareNote] = useState<BookNote | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sessionEdit, setSessionEdit] = useState<ReadingSession | null>(null);
  const [sessionAddOpen, setSessionAddOpen] = useState(false);

  const totalSeconds = useMemo(
    () => sessions.reduce((s, x) => s + x.durationSeconds, 0),
    [sessions]
  );

  const allBooks = useStore((s) => s.books);
  // Next unread book in the same series (ordered by series number).
  const nextInSeries = useMemo(() => {
    if (!book?.series) return undefined;
    return allBooks
      .filter(
        (b) =>
          b.id !== book.id &&
          b.series === book.series &&
          b.status !== 'finished'
      )
      .sort((a, b) => (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999))[0];
  }, [allBooks, book?.series, book?.id]);

  const eta = useMemo(
    () => (book && book.status === 'reading' ? estimateRemaining(book, sessions) : null),
    [book, sessions]
  );

  const saveSession = (draft: SessionDraft, existing: ReadingSession | null) => {
    const pagesRead =
      draft.startPage != null && draft.endPage != null
        ? Math.max(0, draft.endPage - draft.startPage)
        : 0;
    // Keep the original time-of-day when editing (only the day is editable);
    // new sessions default to midday of the chosen day. Rebuilt via calendar
    // APIs, not `dayTs + fixed offset`: on a DST-transition day (23h/25h) a
    // millisecond offset from midnight lands on the wrong wall-clock hour -
    // or even the wrong day.
    let startTime: number;
    if (existing) {
      const orig = new Date(existing.startTime);
      const d = new Date(draft.dayTs);
      d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
      startTime = d.getTime();
    } else {
      const d = new Date(draft.dayTs);
      d.setHours(12, 0, 0, 0); // midday of the chosen day
      startTime = d.getTime();
    }
    const durationSeconds = draft.minutes * 60;
    if (existing) {
      store.updateSession(existing.id, {
        startTime,
        endTime: startTime + durationSeconds * 1000,
        durationSeconds,
        startPage: draft.startPage,
        endPage: draft.endPage,
        pagesRead,
      });
    } else {
      store.addSession({
        bookId: id!,
        startTime,
        endTime: startTime + durationSeconds * 1000,
        durationSeconds,
        startPage: draft.startPage,
        endPage: draft.endPage,
        pagesRead,
      });
    }
  };

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
        <Text style={{ color: t.colors.text }}>{tr('book.notFound')}</Text>
      </View>
    );
  }

  const progress =
    book.pageCount && book.pageCount > 0
      ? Math.min(1, book.currentPage / book.pageCount)
      : book.status === 'finished'
      ? 1
      : 0;

  // Finished books start a fresh read cycle (with a confirm) so the reread is
  // actually recorded; unfinished books go straight to the timer.
  const startOrReread = () => {
    if (book.status === 'finished') {
      Alert.alert(tr('book.rereadTitle'), tr('book.rereadMsg'), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('book.reread'),
          onPress: () => {
            store.startReread(book.id);
            router.push(`/timer/${book.id}`);
          },
        },
      ]);
    } else {
      router.push(`/timer/${book.id}`);
    }
  };

  // The delete icon sits inside the tappable session row, so a slightly-off
  // tap meant to open the editor must not silently erase history.
  const confirmDeleteSession = (sessionId: string) => {
    Alert.alert(tr('session.deleteTitle'), tr('session.deleteMsg'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: () => store.deleteSession(sessionId),
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(tr('book.deleteTitle'), tr('book.deleteMsg', { title: book.title }), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: () => {
          const removed = store.deleteBooks([book.id]);
          router.back();
          showSnackbar(tr('book.deletedOne'), {
            actionLabel: tr('common.undo'),
            onAction: () => store.restoreBooks(removed),
            // Cover files are NOT deleted here: the delete may still be
            // un-persisted (or undone), and launch-time reconcileCovers
            // reclaims files no longer referenced by the saved data.
          });
        },
      },
    ]);
  };


  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.lg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
              <Pressable onPress={() => setShareOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('wrapped.share')}>
                <Ionicons name="share-social-outline" size={22} color={t.colors.primary} />
              </Pressable>
              <Pressable onPress={() => router.push(`/book/edit/${book.id}`)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('book.editLabel')}>
                <Ionicons name="create-outline" size={22} color={t.colors.primary} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('common.delete')}>
                <Ionicons name="trash-outline" size={22} color={t.colors.danger} />
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Header */}
      <View style={styles.header}>
        <BookCover uri={book.coverUrl} title={book.title} width={120} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.title, { color: t.colors.text }]}>{book.title}</Text>
          <Text style={[styles.author, { color: t.colors.textMuted }]}>
            {book.authors.join(', ') || tr('common.unknownAuthor')}
          </Text>
          {book.pageCount ? (
            <Text style={[styles.metaSmall, { color: t.colors.textFaint }]}>
              {tr('search.pages', { count: book.pageCount })}
              {book.publishedDate ? ` · ${book.publishedDate.slice(0, 4)}` : ''}
            </Text>
          ) : null}
          <View style={{ marginTop: 4 }}>
            <RatingStars
              value={book.rating ?? 0}
              size={22}
              onChange={(v) => store.setRating(book.id, v)}
            />
          </View>
        </View>
      </View>

      {/* Series / pace / moods */}
      {book.series || book.pace || (book.moods && book.moods.length) ? (
        <View style={styles.tagsRow}>
          {book.series ? (
            <Pill
              icon="albums"
              label={`${book.series}${book.seriesNumber != null ? ` #${book.seriesNumber}` : ''}`}
            />
          ) : null}
          {book.pace ? <Pill icon="speedometer" label={tr(`pace.${book.pace}`)} /> : null}
          {(book.moods ?? []).map((m) => (
            <Pill key={m} label={tr(`mood.${m}`)} />
          ))}
        </View>
      ) : null}

      {/* Primary action */}
      <Button
        label={book.status === 'finished' ? tr('book.reread') : tr('book.startReading')}
        icon="play"
        full
        onPress={startOrReread}
      />

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('book.status')}</SectionTitle>
        <View style={styles.pills}>
          {STATUS_ORDER.map((s) => (
            <Pill
              key={s}
              label={tr(`status.${s}`)}
              active={book.status === s}
              onPress={() => store.setStatus(book.id, s)}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle
          right={
            <Pressable onPress={() => setProgressOpen(true)}>
              <Text style={[styles.link, { color: t.colors.primary }]}>{tr('book.update')}</Text>
            </Pressable>
          }
        >
          {tr('book.progress')}
        </SectionTitle>
        <ProgressBar progress={progress} height={10} />
        <View style={styles.progressRow}>
          <Text style={[styles.progressTxt, { color: t.colors.text }]}>
            {tr('book.page', { n: book.currentPage })}
            {book.pageCount ? ` / ${book.pageCount}` : ''}
          </Text>
          <Text style={[styles.progressTxt, { color: t.colors.textMuted }]}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
        <View style={styles.statRow}>
          <MiniStat label={tr('book.totalTime')} value={formatDuration(totalSeconds)} t={t} />
          <MiniStat label={tr('book.sessions')} value={String(sessions.length)} t={t} />
          {book.readCount && book.readCount > 1 ? (
            <MiniStat label={tr('book.timesRead')} value={`${book.readCount}×`} t={t} />
          ) : book.startedAt ? (
            <MiniStat label={tr('book.startedOn')} value={formatDate(book.startedAt, lang)} t={t} />
          ) : null}
        </View>
        {eta ? (
          <View style={[styles.etaRow, { backgroundColor: t.colors.cardAlt }]}>
            <Ionicons name="hourglass-outline" size={16} color={t.colors.primary} />
            <Text style={[styles.etaTxt, { color: t.colors.textMuted }]}>
              {tr('book.etaLeft', { time: formatDuration(eta.secondsLeft), pages: eta.pagesLeft })}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Next in series */}
      {nextInSeries ? (
        <Pressable onPress={() => router.replace(`/book/${nextInSeries.id}`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <BookCover uri={nextInSeries.coverUrl} title={nextInSeries.title} width={40} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.muted, { color: t.colors.textFaint }]}>{tr('book.nextInSeries')}</Text>
              <Text style={[styles.body, { color: t.colors.text }]} numberOfLines={1}>
                {nextInSeries.seriesNumber != null ? `#${nextInSeries.seriesNumber} · ` : ''}
                {nextInSeries.title}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.colors.textFaint} />
          </Card>
        </Pressable>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('book.shelves')}</SectionTitle>
        {shelves.length === 0 ? (
          <Text style={[styles.muted, { color: t.colors.textMuted }]}>
            {tr('book.shelvesEmpty')}
          </Text>
        ) : (
          <View style={styles.pills}>
            {shelves.map((sh) => (
              <Pill
                key={sh.id}
                label={sh.name}
                color={sh.color}
                icon={sh.emoji ? undefined : (sh.icon ?? 'bookmark')}
                emoji={sh.emoji}
                active={book.shelfIds.includes(sh.id)}
                onPress={() => store.toggleShelfForBook(book.id, sh.id)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle
          right={
            <Pressable onPress={() => setReviewOpen(true)}>
              <Text style={[styles.link, { color: t.colors.primary }]}>
                {book.review ? tr('book.editLabel') : tr('book.addLabel')}
              </Text>
            </Pressable>
          }
        >
          {tr('book.review')}
        </SectionTitle>
        {book.review ? (
          <Text style={[styles.body, { color: t.colors.text }]}>{book.review}</Text>
        ) : (
          <Text style={[styles.muted, { color: t.colors.textMuted }]}>
            {tr('book.reviewEmpty')}
          </Text>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle
          right={
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable onPress={() => setNoteOpen('quote')}>
                <Text style={[styles.link, { color: t.colors.primary }]}>{tr('book.addQuote')}</Text>
              </Pressable>
              <Pressable onPress={() => setNoteOpen('note')}>
                <Text style={[styles.link, { color: t.colors.primary }]}>{tr('book.addNote')}</Text>
              </Pressable>
            </View>
          }
        >
          {tr('book.notes')}
        </SectionTitle>
        {notes.length === 0 ? (
          <Text style={[styles.muted, { color: t.colors.textMuted }]}>
            {tr('book.notesEmpty')}
          </Text>
        ) : (
          notesSorted.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              onDelete={() => store.deleteNote(n.id)}
              onShare={() => setShareNote(n)}
            />
          ))
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle
          right={
            <Pressable onPress={() => setSessionAddOpen(true)}>
              <Text style={[styles.link, { color: t.colors.primary }]}>{tr('session.add')}</Text>
            </Pressable>
          }
        >
          {tr('book.history')}
        </SectionTitle>
        {sessions.length === 0 ? (
          <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('book.historyEmpty')}</Text>
        ) : (
          sessionsSorted.map((s) => (
            <Pressable key={s.id} style={styles.sessionRow} onPress={() => setSessionEdit(s)}>
                <Ionicons name="time-outline" size={18} color={t.colors.textFaint} />
                <Text style={[styles.body, { color: t.colors.text, flex: 1 }]}>
                  {formatDate(s.startTime, lang)}
                </Text>
                <Text style={[styles.body, { color: t.colors.textMuted }]}>
                  {formatDuration(s.durationSeconds)}
                  {s.pagesRead ? ` · ${s.pagesRead} ${tr('common.pageAbbr')}` : ''}
                </Text>
                <Pressable onPress={() => confirmDeleteSession(s.id)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={t.colors.textFaint} />
                </Pressable>
              </Pressable>
            ))
        )}
      </Card>

      {book.description ? (
        <Card style={{ gap: spacing.sm }}>
          <SectionTitle>{tr('book.description')}</SectionTitle>
          <Text
            numberOfLines={descExpanded ? undefined : 5}
            style={[styles.body, { color: t.colors.textMuted, lineHeight: 21 }]}
          >
            {book.description}
          </Text>
          <Pressable onPress={() => setDescExpanded((v) => !v)}>
            <Text style={[styles.link, { color: t.colors.primary }]}>
              {descExpanded ? tr('book.readLess') : tr('book.readMore')}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {/* Modals */}
      <ProgressModal
        open={progressOpen}
        initial={book.currentPage}
        max={book.pageCount}
        onClose={() => setProgressOpen(false)}
        onSave={(p) => {
          store.setProgress(book.id, p);
          setProgressOpen(false);
        }}
      />
      <TextModal
        open={reviewOpen}
        title={tr('book.review')}
        initial={book.review ?? ''}
        multiline
        onClose={() => setReviewOpen(false)}
        onSave={(text) => {
          store.updateBook(book.id, { review: text.trim() || undefined });
          setReviewOpen(false);
        }}
      />
      <NoteModal
        open={noteOpen !== null}
        type={noteOpen ?? 'note'}
        onClose={() => setNoteOpen(null)}
        onSave={(text, page) => {
          if (text.trim()) {
            store.addNote({ bookId: book.id, type: noteOpen ?? 'note', text: text.trim(), page });
            void Haptics.selectionAsync();
          }
          setNoteOpen(null);
        }}
      />

      <QuoteShareModal
        visible={shareNote !== null}
        quote={shareNote?.text}
        title={book.title}
        author={book.authors.join(', ') || tr('common.unknownAuthor')}
        page={shareNote?.page}
        onClose={() => setShareNote(null)}
      />

      <BookShareModal visible={shareOpen} book={book} onClose={() => setShareOpen(false)} />

      <SessionEditor
        visible={sessionAddOpen}
        defaultStartPage={book.currentPage}
        onClose={() => setSessionAddOpen(false)}
        onSave={(draft) => saveSession(draft, null)}
      />
      <SessionEditor
        visible={sessionEdit !== null}
        session={sessionEdit}
        onClose={() => setSessionEdit(null)}
        onSave={(draft) => saveSession(draft, sessionEdit)}
      />
    </ScrollView>
  );
}

function MiniStat({ label, value, t }: { label: string; value: string; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, { color: t.colors.text }]}>{value}</Text>
      <Text style={[styles.miniLabel, { color: t.colors.textFaint }]}>{label}</Text>
    </View>
  );
}

function NoteItem({
  note,
  onDelete,
  onShare,
}: {
  note: BookNote;
  onDelete: () => void;
  onShare: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const isQuote = note.type === 'quote';
  return (
    <View
      style={[
        styles.note,
        {
          backgroundColor: t.colors.cardAlt,
          borderLeftColor: isQuote ? t.colors.accent : t.colors.primary,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.noteText, { color: t.colors.text, fontStyle: isQuote ? 'italic' : 'normal' }]}>
          {isQuote ? `“${note.text}”` : note.text}
        </Text>
        {note.page != null ? (
          <Text style={[styles.notePage, { color: t.colors.textFaint }]}>{tr('common.pageAbbr')} {note.page}</Text>
        ) : null}
      </View>
      <View style={{ gap: 12, alignItems: 'center' }}>
        <Pressable onPress={onShare} hitSlop={8}>
          <Ionicons name="share-social-outline" size={16} color={t.colors.primary} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="close" size={16} color={t.colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

function ProgressModal({
  open,
  initial,
  max,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: number;
  max?: number;
  onClose: () => void;
  onSave: (page: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [val, setVal] = useState(String(initial));
  return (
    <CenterModal
      open={open}
      onClose={onClose}
      title={tr('book.updateProgress')}
      onShow={() => setVal(String(initial))}
    >
      <Text style={[styles.modalLabel, { color: t.colors.textMuted }]}>
        {max ? tr('book.currentPageOf', { n: max }) : tr('book.currentPage')}
      </Text>
      <TextInput
        value={val}
        onChangeText={setVal}
        keyboardType="numeric"
        autoFocus
        selectTextOnFocus
        style={[styles.modalInput, { backgroundColor: t.colors.cardAlt, color: t.colors.text }]}
      />
      <Button
        label={tr('common.save')}
        full
        onPress={() => onSave(Math.max(0, parseInt(val, 10) || 0))}
      />
    </CenterModal>
  );
}

function TextModal({
  open,
  title,
  initial,
  multiline,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  multiline?: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [val, setVal] = useState(initial);
  return (
    <CenterModal open={open} onClose={onClose} title={title} onShow={() => setVal(initial)}>
      <TextInput
        value={val}
        onChangeText={setVal}
        multiline={multiline}
        autoFocus
        placeholder={tr('book.writeHere')}
        placeholderTextColor={t.colors.textFaint}
        style={[
          styles.modalInput,
          {
            backgroundColor: t.colors.cardAlt,
            color: t.colors.text,
            height: multiline ? 140 : 48,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      <Button label={tr('common.save')} full onPress={() => onSave(val)} />
    </CenterModal>
  );
}

function NoteModal({
  open,
  type,
  onClose,
  onSave,
}: {
  open: boolean;
  type: 'note' | 'quote';
  onClose: () => void;
  onSave: (text: string, page?: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [val, setVal] = useState('');
  const [page, setPage] = useState('');
  return (
    <CenterModal
      open={open}
      onClose={onClose}
      title={type === 'quote' ? tr('book.newQuote') : tr('book.newNote')}
      onShow={() => {
        setVal('');
        setPage('');
      }}
    >
      <TextInput
        value={val}
        onChangeText={setVal}
        multiline
        autoFocus
        placeholder={type === 'quote' ? tr('book.quotePlaceholder') : tr('book.notePlaceholder')}
        placeholderTextColor={t.colors.textFaint}
        style={[
          styles.modalInput,
          { backgroundColor: t.colors.cardAlt, color: t.colors.text, height: 120, textAlignVertical: 'top' },
        ]}
      />
      <TextInput
        value={page}
        onChangeText={setPage}
        keyboardType="numeric"
        placeholder={tr('book.pageOptional')}
        placeholderTextColor={t.colors.textFaint}
        style={[styles.modalInput, { backgroundColor: t.colors.cardAlt, color: t.colors.text }]}
      />
      <Button
        label={tr('common.save')}
        full
        onPress={() => onSave(val, page ? parseInt(page, 10) || undefined : undefined)}
      />
    </CenterModal>
  );
}

function CenterModal({
  open,
  onClose,
  title,
  children,
  onShow,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onShow?: () => void;
}) {
  return (
    <Dialog visible={open} onClose={onClose} title={title} onShow={onShow}>
      {children}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', gap: spacing.lg },
  title: { fontSize: 21, fontWeight: '800' },
  author: { fontSize: 15 },
  metaSmall: { fontSize: 13 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -spacing.sm },
  link: { fontSize: 14, fontWeight: '700' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTxt: { fontSize: 15, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm, flexWrap: 'wrap' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginTop: spacing.sm },
  etaTxt: { fontSize: 13, fontWeight: '600', flex: 1 },
  miniStat: { gap: 2 },
  miniValue: { fontSize: 16, fontWeight: '800' },
  miniLabel: { fontSize: 11 },
  body: { fontSize: 14 },
  muted: { fontSize: 14 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  noteText: { fontSize: 14, lineHeight: 20 },
  notePage: { fontSize: 12, marginTop: 4 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalLabel: { fontSize: 13, fontWeight: '600' },
  modalInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: 48,
  },
});
