import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AppData } from '@/types';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { APP_NAME } from '@/lib/constants';
import { Button, Card, ProgressBar, SectionTitle } from '@/components/ui';
import { exportCsv, exportData, importData, INVALID_BACKUP } from '@/lib/backup';
import { PERSIST_FAILED } from '@/lib/storage';
import { deleteCoverFile } from '@/lib/covers';
import { parseBookCsv } from '@/lib/importSources';
import { booksNeedingData, fillMissingData, FillProgress } from '@/services/catalogRefresh';

// CSV exports are plain text; anything this big is not a Goodreads/StoryGraph file.
const MAX_CSV_BYTES = 16 * 1024 * 1024;

export default function DataSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  // Which action is running: every button is disabled meanwhile (a second tap
  // used to open a second document picker), only the active one spins.
  const [busy, setBusy] = useState<'export' | 'import' | 'csv' | 'exportCsv' | null>(null);

  // Catalogue lookups (after a CSV import, or the "fill in" button) stop when
  // the user leaves this screen, so they don't keep hitting the network.
  const mounted = useRef(true);
  const enrichAbort = useRef(new AbortController());
  const fillAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      enrichAbort.current.abort();
      fillAbort.current?.abort();
    },
    []
  );

  const books = useStore((s) => s.books);
  const fillCandidates = useMemo(() => booksNeedingData(books).length, [books]);
  const [fillProgress, setFillProgress] = useState<FillProgress | null>(null);

  const onFill = async () => {
    const ids = booksNeedingData(useStore.getState().books).map((b) => b.id);
    if (ids.length === 0 || fillAbort.current) return;
    const controller = new AbortController();
    fillAbort.current = controller;
    setFillProgress({ done: 0, total: ids.length, updated: 0 });
    const res = await fillMissingData(ids, {
      signal: controller.signal,
      onProgress: (p) => mounted.current && setFillProgress(p),
    });
    fillAbort.current = null;
    if (!mounted.current) return;
    setFillProgress(null);
    const counts = { updated: res.updated, total: res.total };
    if (res.stopped === 'offline') Alert.alert(tr('fill.offlineTitle'), tr('fill.offlineMsg', counts));
    else Alert.alert(tr('common.done'), tr('fill.doneMsg', counts));
  };

  const onExport = async () => {
    const s = useStore.getState();
    if (s.books.length === 0) {
      Alert.alert(tr('settings.nothingExportTitle'), tr('settings.nothingExportMsg'));
      return;
    }
    const data: AppData = {
      books: s.books,
      sessions: s.sessions,
      notes: s.notes,
      shelves: s.shelves,
      goals: s.goals,
      version: s.version,
    };
    try {
      setBusy('export');
      const ok = await exportData(data, tr('settings.exportTitle'));
      if (!ok) Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
    } catch (e) {
      Alert.alert(tr('common.error'), String(e));
    } finally {
      setBusy(null);
    }
  };

  const onExportCsv = async () => {
    const s = useStore.getState();
    if (s.books.length === 0) {
      Alert.alert(tr('settings.nothingExportTitle'), tr('settings.nothingExportMsg'));
      return;
    }
    try {
      setBusy('exportCsv');
      const ok = await exportCsv(
        { books: s.books, sessions: [], notes: [], shelves: s.shelves, goals: [], version: s.version },
        tr('settings.exportCsvTitle')
      );
      if (!ok) Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
    } catch (e) {
      Alert.alert(tr('common.error'), String(e));
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    Alert.alert(tr('settings.importTitle'), tr('settings.importMsg'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('settings.chooseFile'),
        onPress: async () => {
          try {
            setBusy('import');
            const imported = await importData();
            if (imported) {
              const oldCovers = useStore.getState().books.map((b) => b.coverUrl);
              await useStore.getState().replaceAll(imported);
              // Only drop old cover files the restored data no longer references
              // (a re-import on the same device can keep the same local paths).
              const kept = new Set(imported.books.map((b) => b.coverUrl).filter(Boolean));
              oldCovers.forEach((u) => {
                if (u && !kept.has(u)) void deleteCoverFile(u);
              });
              Alert.alert(tr('common.done'), tr('settings.importDoneMsg'));
            }
          } catch (e) {
            const msg =
              e instanceof Error && e.message === INVALID_BACKUP
                ? tr('settings.invalidBackup', { app: APP_NAME })
                : e instanceof Error && e.message === PERSIST_FAILED
                ? tr('data.saveFailed')
                : String(e);
            Alert.alert(tr('settings.importFailTitle'), msg);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const onImportCsv = async () => {
    try {
      setBusy('csv');
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.size != null && asset.size > MAX_CSV_BYTES) {
        Alert.alert(tr('settings.importFailTitle'), tr('settings.fileTooLarge'));
        return;
      }
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = parseBookCsv(content);
      if (!parsed) {
        Alert.alert(tr('settings.importFailTitle'), tr('settings.csvUnsupported'));
        return;
      }
      const { added, skipped, addedIds } = useStore.getState().addImportedBooks(parsed.books);
      Alert.alert(
        tr('common.done'),
        tr('settings.csvImported', {
          added,
          skipped,
          source: parsed.source === 'goodreads' ? 'Goodreads' : 'StoryGraph',
        })
      );
      // Exports carry no covers (and StoryGraph no page counts): fill the
      // empty fields from each book's ISBN - best-effort, in the background,
      // capped; the "fill in" card below handles the rest on demand.
      void fillMissingData(addedIds, { signal: enrichAbort.current.signal, limit: 60 });
    } catch (e) {
      Alert.alert(tr('settings.importFailTitle'), String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('settings.backup')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.backupDesc')}</Text>
        <Button label={tr('settings.export')} icon="cloud-upload" variant="secondary" full loading={busy === 'export'} disabled={busy != null} onPress={onExport} />
        <Button label={tr('settings.import')} icon="cloud-download" variant="secondary" full loading={busy === 'import'} disabled={busy != null} onPress={onImport} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('settings.importCsv')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.csvDesc')}</Text>
        <Button label={tr('settings.importCsv')} icon="library" variant="secondary" full loading={busy === 'csv'} disabled={busy != null} onPress={onImportCsv} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('fill.title')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('fill.desc')}</Text>
        {fillProgress ? (
          <>
            <Text style={[styles.muted, { color: t.colors.text }]}>{tr('fill.progress', { ...fillProgress })}</Text>
            <ProgressBar progress={fillProgress.total ? fillProgress.done / fillProgress.total : 0} />
            <Text style={[styles.muted, { color: t.colors.textFaint }]}>{tr('fill.keepOpen')}</Text>
            <Button label={tr('common.cancel')} icon="close" variant="secondary" full onPress={() => fillAbort.current?.abort()} />
          </>
        ) : (
          <>
            <Text style={[styles.muted, { color: t.colors.text }]}>
              {fillCandidates > 0 ? tr('fill.count', { n: fillCandidates }) : tr('fill.none')}
            </Text>
            <Button label={tr('fill.start')} icon="cloud-download-outline" variant="secondary" full disabled={fillCandidates === 0} onPress={onFill} />
          </>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('settings.exportCsv')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.exportCsvDesc')}</Text>
        <Button label={tr('settings.exportCsv')} icon="document-text" variant="secondary" full loading={busy === 'exportCsv'} disabled={busy != null} onPress={onExportCsv} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, lineHeight: 20 },
});
