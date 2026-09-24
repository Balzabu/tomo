import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BottomSheet } from '@/components/BottomSheet';
import { BookCover } from '@/components/BookCover';
import { Button, EmptyState } from '@/components/ui';
import {
  defaultSelection,
  diffBook,
  FieldDiff,
  patchFrom,
  RefreshField,
  RefreshValues,
} from '@/lib/bookRefresh';
import { fetchCatalogValues } from '@/services/catalogRefresh';

type Phase = 'loading' | 'offline' | 'notfound' | 'ok';

interface Props {
  visible: boolean;
  isbn: string;
  /** the values the diff is made against (the edit form's draft) */
  current: RefreshValues;
  title: string;
  onApply: (patch: RefreshValues) => void;
  /** every completed lookup: the catalogue values, or null for an unknown
   *  ISBN (not called when offline or cancelled) */
  onResult?: (values: RefreshValues | null) => void;
  onClose: () => void;
}

/**
 * Looks the ISBN up and shows what the catalogues would change, field by
 * field: missing fields pre-selected, differing ones opt-in. Nothing is
 * written here - the patch goes back to the caller's form.
 */
export function CatalogRefreshSheet({ visible, isbn, current, title, onApply, onResult, onClose }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [phase, setPhase] = useState<Phase>('loading');
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [selected, setSelected] = useState<Set<RefreshField>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const currentRef = useRef(current);
  currentRef.current = current;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!visible) return;
    // One lookup per open/retry; closing the sheet (or leaving the screen)
    // cancels it, and a late answer from a cancelled lookup is ignored.
    const controller = new AbortController();
    setPhase('loading');
    setDiffs([]);
    void fetchCatalogValues(isbn, { signal: controller.signal }).then((out) => {
      if (controller.signal.aborted) return;
      if (out.status !== 'offline') onResultRef.current?.(out.status === 'ok' ? out.values : null);
      if (out.status !== 'ok') {
        setPhase(out.status);
        return;
      }
      const d = diffBook(currentRef.current, out.values);
      setDiffs(d);
      setSelected(defaultSelection(d));
      setPhase('ok');
    });
    return () => controller.abort();
  }, [visible, isbn, attempt]);

  const toggle = (f: RefreshField) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const apply = () => {
    onApply(patchFrom(diffs, selected, currentRef.current));
    onClose();
  };

  const show = (v: FieldDiff['current']) => {
    if (v == null || (Array.isArray(v) && v.length === 0)) return tr('refresh.empty');
    return Array.isArray(v) ? v.join(', ') : String(v);
  };

  let body: React.ReactNode;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={t.colors.primary} />
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('refresh.loading')}</Text>
      </View>
    );
  } else if (phase === 'offline') {
    body = (
      <View style={{ gap: spacing.md }}>
        <EmptyState icon="cloud-offline-outline" title={tr('search.offline')} subtitle={tr('search.offlineSub')} />
        <Button label={tr('error.retry')} icon="refresh" full onPress={() => setAttempt((n) => n + 1)} />
      </View>
    );
  } else if (phase === 'notfound') {
    body = <EmptyState icon="help-circle-outline" title={tr('refresh.notFound')} subtitle={tr('refresh.notFoundSub')} />;
  } else if (diffs.length === 0) {
    body = <EmptyState icon="checkmark-circle-outline" title={tr('refresh.upToDate')} subtitle={tr('refresh.upToDateSub')} />;
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('refresh.hint')}</Text>
        <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.5 }} contentContainerStyle={{ gap: spacing.sm }}>
          {diffs.map((d) => {
            const on = selected.has(d.field);
            return (
              <Pressable
                key={d.field}
                onPress={() => toggle(d.field)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={tr(`refresh.field.${d.field}`)}
                style={[styles.row, { backgroundColor: t.colors.cardAlt, borderColor: on ? t.colors.primary : 'transparent' }]}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.colors.primary : t.colors.textFaint} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr(`refresh.field.${d.field}`)}</Text>
                  {d.field === 'coverUrl' ? (
                    <View style={styles.covers}>
                      {d.current ? <BookCover uri={d.current as string} title={title} width={48} /> : null}
                      {d.current ? <Ionicons name="arrow-forward" size={16} color={t.colors.textFaint} /> : null}
                      <BookCover uri={d.incoming as string} title={title} width={48} />
                    </View>
                  ) : (
                    <>
                      <Text numberOfLines={d.field === 'description' ? 4 : 3} style={[styles.value, { color: t.colors.text }]}>
                        {show(d.incoming)}
                      </Text>
                      {d.kind === 'change' ? (
                        <Text numberOfLines={2} style={[styles.old, { color: t.colors.textFaint }]}>
                          {show(d.current)}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button label={tr('refresh.apply')} icon="checkmark" full disabled={selected.size === 0} onPress={apply} />
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('refresh.title')}>
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  muted: { fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'flex-start',
  },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  value: { fontSize: 15 },
  old: { fontSize: 13, textDecorationLine: 'line-through' },
  covers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
