import { memo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '@/components/ThemedTextInput';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { BookNote, NoteType } from '@/types';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

/** One note/quote card: tap to edit, share and delete on the side. */
export const NoteItem = memo(function NoteItem({
  note,
  onEdit,
  onDelete,
  onShare,
  footer,
}: {
  note: BookNote;
  onEdit: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  /** extra line under the page (e.g. the book title in the global list) */
  footer?: React.ReactNode;
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
      <Pressable
        style={{ flex: 1 }}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={isQuote ? tr('book.editQuote') : tr('book.editNote')}
      >
        <Text style={[styles.noteText, { color: t.colors.text, fontStyle: isQuote ? 'italic' : 'normal' }]}>
          {isQuote ? `“${note.text}”` : note.text}
        </Text>
        {note.page != null ? (
          <Text style={[styles.notePage, { color: t.colors.textFaint }]}>
            {tr('common.pageAbbr')} {note.page}
          </Text>
        ) : null}
        {footer}
      </Pressable>
      <View style={{ gap: 12, alignItems: 'center' }}>
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('wrapped.share')}>
            <Ionicons name="share-social-outline" size={16} color={t.colors.primary} />
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common.delete')}>
            <Ionicons name="close" size={16} color={t.colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/**
 * Create or edit a note/quote. New entries can switch between note and quote
 * right in the dialog (the user often only knows once they start typing), and
 * the page comes pre-filled with where they are in the book.
 */
export function NoteModal({
  open,
  type,
  initial,
  defaultPage,
  subtitle,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  type: NoteType;
  /** set when editing an existing note/quote */
  initial?: { text: string; page?: number };
  /** pre-filled page for a new entry */
  defaultPage?: number;
  /** context line under the title (e.g. the book) */
  subtitle?: string;
  onClose: () => void;
  onSave: (text: string, page: number | undefined, type: NoteType) => void;
  onDelete?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [val, setVal] = useState('');
  const [page, setPage] = useState('');
  const [kind, setKind] = useState<NoteType>(type);
  const title = initial
    ? kind === 'quote' ? tr('book.editQuote') : tr('book.editNote')
    : kind === 'quote' ? tr('book.newQuote') : tr('book.newNote');
  // One save per opening: a double tap before the dialog closes would
  // otherwise add the note twice.
  const saved = useRef(false);
  const save = () => {
    if (saved.current) return;
    saved.current = true;
    onSave(val, page ? parseInt(page, 10) || undefined : undefined, kind);
  };
  const pageNum = parseInt(page, 10) || 0;
  return (
    <Dialog
      visible={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      onShow={() => {
        saved.current = false;
        setKind(type);
        setVal(initial?.text ?? '');
        const p = initial ? initial.page : defaultPage;
        setPage(p != null && p > 0 ? String(p) : '');
      }}
      footer={
        <View style={styles.actions}>
          {onDelete ? (
            <Pressable onPress={onDelete} hitSlop={8} style={styles.delete} accessibilityRole="button" accessibilityLabel={tr('common.delete')}>
              <Ionicons name="trash-outline" size={20} color={t.colors.danger} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label={tr('common.save')} icon="checkmark" full disabled={!val.trim()} onPress={save} />
          </View>
        </View>
      }
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'quote', label: tr('notes.kind.quote'), icon: 'chatbox-ellipses-outline' },
          { value: 'note', label: tr('notes.kind.note'), icon: 'create-outline' },
        ]}
      />
      <TextInput
        value={val}
        onChangeText={setVal}
        multiline
        autoFocus
        placeholder={kind === 'quote' ? tr('book.quotePlaceholder') : tr('book.notePlaceholder')}
        placeholderTextColor={t.colors.textFaint}
        style={[
          styles.input,
          {
            backgroundColor: t.colors.cardAlt,
            color: t.colors.text,
            fontStyle: kind === 'quote' && val ? 'italic' : 'normal',
          },
        ]}
      />
      <View style={[styles.pageRow, { backgroundColor: t.colors.cardAlt }]}>
        <Ionicons name="bookmark-outline" size={18} color={t.colors.primary} />
        <Text style={[styles.pageLabel, { color: t.colors.text }]}>{tr('notes.page')}</Text>
        <Pressable onPress={() => setPage(String(Math.max(1, pageNum - 1)))} hitSlop={6} style={styles.step} accessibilityLabel="-1">
          <Ionicons name="remove" size={18} color={t.colors.textMuted} />
        </Pressable>
        <TextInput
          value={page}
          onChangeText={(v) => setPage(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="—"
          placeholderTextColor={t.colors.textFaint}
          selectTextOnFocus
          style={[styles.pageInput, { color: t.colors.text, backgroundColor: t.colors.card }]}
        />
        <Pressable onPress={() => setPage(String(pageNum + 1))} hitSlop={6} style={styles.step} accessibilityLabel="+1">
          <Ionicons name="add" size={18} color={t.colors.textMuted} />
        </Pressable>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  noteText: { fontSize: 14, lineHeight: 20 },
  notePage: { fontSize: 12, marginTop: 4 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm },
  subtitle: { fontSize: 13, flex: 1 },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 130,
    maxHeight: 260,
    textAlignVertical: 'top',
  },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52 },
  pageLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pageInput: { width: 72, height: 36, borderRadius: radius.sm, textAlign: 'center', fontSize: 16, fontWeight: '700', paddingVertical: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  delete: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
