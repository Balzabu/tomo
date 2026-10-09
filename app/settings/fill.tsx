import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, ProgressBar } from '@/components/ui';
import { SettingsFootnote, SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { booksNeedingData, fillMissingData, FillProgress } from '@/services/catalogRefresh';

/** Look up covers, pages and the rest for books that have an ISBN. */
export default function FillSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();

  // The lookups stop when the user leaves this screen, so they don't keep
  // hitting the network.
  const mounted = useRef(true);
  const fillAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      fillAbort.current?.abort();
    },
    []
  );

  const books = useStore((s) => s.books);
  const candidates = useMemo(() => booksNeedingData(books).length, [books]);
  const [progress, setProgress] = useState<FillProgress | null>(null);

  const onFill = async () => {
    const ids = booksNeedingData(useStore.getState().books).map((b) => b.id);
    if (ids.length === 0 || fillAbort.current) return;
    const controller = new AbortController();
    fillAbort.current = controller;
    setProgress({ done: 0, total: ids.length, updated: 0 });
    const res = await fillMissingData(ids, {
      signal: controller.signal,
      onProgress: (p) => mounted.current && setProgress(p),
    });
    fillAbort.current = null;
    if (!mounted.current) return;
    setProgress(null);
    const counts = { updated: res.updated, total: res.total };
    if (res.stopped === 'offline') Alert.alert(tr('fill.offlineTitle'), tr('fill.offlineMsg', counts));
    else Alert.alert(tr('common.done'), tr('fill.doneMsg', counts));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}>
      <SettingsGroup>
        {progress ? (
          <View style={styles.progress}>
            <Text style={[styles.label, { color: t.colors.text }]}>{tr('fill.progress', { ...progress })}</Text>
            <ProgressBar progress={progress.total ? progress.done / progress.total : 0} />
            <View style={styles.progressFoot}>
              <Text style={[styles.small, { color: t.colors.textFaint, flex: 1 }]}>{tr('fill.keepOpen')}</Text>
              <Button label={tr('common.cancel')} variant="ghost" onPress={() => fillAbort.current?.abort()} />
            </View>
          </View>
        ) : (
          <SettingsRow
            first
            icon="sparkles"
            label={tr('fill.start')}
            value={candidates > 0 ? String(candidates) : undefined}
            disabled={candidates === 0}
            onPress={() => void onFill()}
          />
        )}
      </SettingsGroup>
      {!progress && candidates === 0 ? <SettingsFootnote>{tr('fill.none')}</SettingsFootnote> : null}
      <SettingsFootnote>{tr('fill.desc')}</SettingsFootnote>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  progress: { padding: spacing.md, gap: spacing.sm },
  progressFoot: { flexDirection: 'row', alignItems: 'center' },
});
