import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { APP_NAME } from '@/lib/constants';
import { Button, Card, SectionTitle } from '@/components/ui';
import { exportData, importData, INVALID_BACKUP } from '@/lib/backup';
import { deleteCoverFile } from '@/lib/covers';
import { parseBookCsv } from '@/lib/importSources';
import { lookupByIsbn } from '@/services/bookApi';

export default function DataSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const store = useStore();
  const [busy, setBusy] = useState(false);

  const data = {
    books: store.books,
    sessions: store.sessions,
    notes: store.notes,
    shelves: store.shelves,
    goals: store.goals,
    version: store.version,
  };

  const onExport = async () => {
    if (store.books.length === 0) {
      Alert.alert(tr('settings.nothingExportTitle'), tr('settings.nothingExportMsg'));
      return;
    }
    try {
      setBusy(true);
      const ok = await exportData(data, tr('settings.exportTitle'));
      if (!ok) Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
    } catch (e) {
      Alert.alert(tr('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    Alert.alert(tr('settings.importTitle'), tr('settings.importMsg'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('settings.chooseFile'),
        onPress: async () => {
          try {
            setBusy(true);
            const imported = await importData();
            if (imported) {
              const oldCovers = store.books.map((b) => b.coverUrl);
              await store.replaceAll(imported);
              oldCovers.forEach((u) => void deleteCoverFile(u));
              Alert.alert(tr('common.done'), tr('settings.importDoneMsg'));
            }
          } catch (e) {
            const msg =
              e instanceof Error && e.message === INVALID_BACKUP
                ? tr('settings.invalidBackup', { app: APP_NAME })
                : String(e);
            Alert.alert(tr('settings.importFailTitle'), msg);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const enrichMissingPages = async (ids: string[]) => {
    const targets = useStore
      .getState()
      .books.filter((b) => ids.includes(b.id) && b.isbn && !b.pageCount)
      .slice(0, 60); // cap network work
    for (const b of targets) {
      try {
        const found = await lookupByIsbn(b.isbn!);
        if (found?.pageCount) {
          // A finished book imported without page data (e.g. StoryGraph) sits at
          // currentPage 0; once we learn the page count, mark it fully read.
          const patch =
            b.status === 'finished' && b.currentPage < found.pageCount
              ? { pageCount: found.pageCount, currentPage: found.pageCount }
              : { pageCount: found.pageCount };
          store.updateBook(b.id, patch);
        }
      } catch {
        // best-effort; skip on failure
      }
    }
  };

  const onImportCsv = async () => {
    try {
      setBusy(true);
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
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = parseBookCsv(content);
      if (!parsed) {
        Alert.alert(tr('settings.importFailTitle'), tr('settings.csvUnsupported'));
        return;
      }
      const { added, skipped, addedIds } = store.addImportedBooks(parsed.books);
      Alert.alert(
        tr('common.done'),
        tr('settings.csvImported', {
          added,
          skipped,
          source: parsed.source === 'goodreads' ? 'Goodreads' : 'StoryGraph',
        })
      );
      // Fill in missing page counts (StoryGraph exports don't include them) by
      // looking up each book's ISBN online - best-effort, in the background.
      void enrichMissingPages(addedIds);
    } catch (e) {
      Alert.alert(tr('settings.importFailTitle'), String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('settings.backup')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.backupDesc')}</Text>
        <Button label={tr('settings.export')} icon="cloud-upload" variant="secondary" full loading={busy} onPress={onExport} />
        <Button label={tr('settings.import')} icon="cloud-download" variant="secondary" full onPress={onImport} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionTitle>{tr('settings.importCsv')}</SectionTitle>
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.csvDesc')}</Text>
        <Button label={tr('settings.importCsv')} icon="library" variant="secondary" full onPress={onImportCsv} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, lineHeight: 20 },
});
