import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import * as DocumentPicker from 'expo-document-picker';
import { AppData } from '@/types';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { formatDate, useTranslation } from '@/i18n';
import { Button, ProgressBar } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { SettingsBlockRow, SettingsFootnote, SettingsGroup, SettingsRow, SettingsSwitchRow } from '@/components/SettingsRow';
import { exportCsv, exportData } from '@/lib/backup';
import { importFromUri } from '@/lib/importFlow';
import { folderLabel, KEEP_CHOICES, pickBackupFolder, runBackup, useBackup } from '@/lib/autoBackup';
import { useSnackbar } from '@/store/useSnackbar';
import { formatTimeOfDay } from '@/lib/utils';
import { Ionicons } from '@expo/vector-icons';
import { booksNeedingData, fillMissingData, FillProgress } from '@/services/catalogRefresh';
import { withLockGrace } from '@/store/useLock';

export default function DataSettings() {
  const t = useTheme();
  const { t: tr, lang } = useTranslation();
  const backup = useBackup((s) => s.config);
  const backupRunning = useBackup((s) => s.running);
  const [howTo, setHowTo] = useState(false);
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
      deleted: s.deleted,
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
        { books: s.books, sessions: [], notes: [], shelves: s.shelves, goals: [], deleted: [], version: s.version },
        tr('settings.exportCsvTitle')
      );
      if (!ok) Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
    } catch (e) {
      Alert.alert(tr('common.error'), String(e));
    } finally {
      setBusy(null);
    }
  };

  // Pick any supported file; the flow recognises it (Tomo backup, Goodreads,
  // StoryGraph, Bookmory, Openreads) and asks before changing anything.
  const pickAndImport = async (which: 'import' | 'csv') => {
    try {
      setBusy(which);
      const res = await withLockGrace(() =>
        DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      );
      if (res.canceled || !res.assets?.[0]) return;
      await importFromUri(res.assets[0].uri, tr, { signal: enrichAbort.current.signal });
    } finally {
      setBusy(null);
    }
  };
  const onImport = () => void pickAndImport('import');

  // --- Automatic backups ---------------------------------------------------
  const toggleAuto = async (on: boolean) => {
    if (!on) {
      useBackup.getState().update({ enabled: false });
      return;
    }
    const dir = backup.dirUri ?? (await pickBackupFolder());
    if (!dir) return;
    useBackup.getState().update({ enabled: true, dirUri: dir, lastError: undefined });
    await backupNow();
  };

  const changeFolder = async () => {
    const dir = await pickBackupFolder(backup.dirUri);
    if (!dir) return;
    useBackup.getState().update({ dirUri: dir, lastError: undefined });
    await backupNow();
  };

  const backupNow = async () => {
    const r = await runBackup();
    if (r.ok) useSnackbar.getState().show(tr('autoBackup.done'));
    else if (r.error === 'busy') return; // one is being written right now
    else if (r.error === 'no_data') Alert.alert(tr('settings.nothingExportTitle'), tr('settings.nothingExportMsg'));
    else Alert.alert(tr('autoBackup.failTitle'), tr('autoBackup.failMsg'));
  };

  const lastLine = backup.lastAt
    ? tr('autoBackup.last', {
        when: tr('common.dateTime', { date: formatDate(backup.lastAt, lang), time: formatTimeOfDay(backup.lastAt) }),
      })
    : tr('autoBackup.never');

  const onImportCsv = () => void pickAndImport('csv');

  const status = backup.lastError
    ? { text: tr('autoBackup.lastFailed'), tone: 'danger' as const }
    : backup.enabled
    ? { text: lastLine, tone: 'muted' as const }
    : { text: tr('autoBackup.desc'), tone: 'muted' as const };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.xl }}>
      <View style={styles.section}>
        <SettingsGroup title={tr('autoBackup.title')}>
          <SettingsSwitchRow first icon="sync" label={tr('autoBackup.enable')} value={backup.enabled} onChange={(v) => void toggleAuto(v)} />
          {backup.enabled ? (
            <>
              <SettingsRow icon="folder-open" label={tr('autoBackup.folder')} value={folderLabel(backup.dirUri)} onPress={() => void changeFolder()} />
              <SettingsBlockRow icon="calendar" label={tr('autoBackup.frequency')}>
                <Segmented
                  value={backup.frequency}
                  onChange={(f) => useBackup.getState().update({ frequency: f })}
                  options={(['daily', 'weekly'] as const).map((f) => ({ value: f, label: tr(`autoBackup.freq.${f}`) }))}
                />
              </SettingsBlockRow>
              <SettingsBlockRow icon="layers" label={tr('autoBackup.keep')}>
                <Segmented
                  value={backup.keep}
                  onChange={(k) => useBackup.getState().update({ keep: k })}
                  options={KEEP_CHOICES.map((k) => ({ value: k, label: k === 0 ? tr('autoBackup.keepAll') : String(k) }))}
                />
              </SettingsBlockRow>
              <SettingsRow icon="save" label={tr('autoBackup.now')} loading={backupRunning} onPress={() => void backupNow()} />
            </>
          ) : null}
        </SettingsGroup>
        <SettingsFootnote tone={status.tone}>{status.text}</SettingsFootnote>
      </View>

      <View style={styles.section}>
        <SettingsGroup title={tr('settings.backup')}>
          <SettingsRow first icon="cloud-upload" label={tr('settings.export')} loading={busy === 'export'} disabled={busy != null && busy !== 'export'} onPress={onExport} />
          <SettingsRow icon="cloud-download" label={tr('settings.import')} loading={busy === 'import'} disabled={busy != null && busy !== 'import'} onPress={onImport} />
        </SettingsGroup>
        <SettingsFootnote>{tr('settings.backupDesc')}</SettingsFootnote>
      </View>

      <View style={styles.section}>
        <SettingsGroup title={tr('import.title')}>
          <SettingsRow first icon="library" label={tr('import.choose')} loading={busy === 'csv'} disabled={busy != null && busy !== 'csv'} onPress={onImportCsv} />
          <SettingsRow icon="help-circle" label={tr('import.howTo')} trailing={howTo ? 'chevron-up' : 'chevron-down'} onPress={() => setHowTo((v) => !v)} />
          {howTo ? (
            <View style={[styles.howTo, { borderTopColor: t.colors.border }]}>
              {(['bookmory', 'openreads', 'goodreads', 'storygraph'] as const).map((app) => (
                <View key={app} style={{ gap: 2 }}>
                  <Text style={[styles.label, { color: t.colors.text }]}>{tr(`import.app.${app}`)}</Text>
                  <Text style={[styles.small, { color: t.colors.textMuted }]}>{tr(`import.how.${app}`)}</Text>
                </View>
              ))}
              <View style={[styles.tip, { backgroundColor: t.colors.cardAlt }]}>
                <Ionicons name="share-social" size={16} color={t.colors.primary} />
                <Text style={[styles.small, { color: t.colors.text, flex: 1 }]}>{tr('import.shareHint')}</Text>
              </View>
            </View>
          ) : null}
        </SettingsGroup>
        <SettingsFootnote>{tr('import.desc')}</SettingsFootnote>
      </View>

      <View style={styles.section}>
        <SettingsGroup title={tr('data.libraryGroup')}>
          {fillProgress ? (
            <View style={styles.progress}>
              <Text style={[styles.label, { color: t.colors.text }]}>{tr('fill.progress', { ...fillProgress })}</Text>
              <ProgressBar progress={fillProgress.total ? fillProgress.done / fillProgress.total : 0} />
              <View style={styles.progressFoot}>
                <Text style={[styles.small, { color: t.colors.textFaint, flex: 1 }]}>{tr('fill.keepOpen')}</Text>
                <Button label={tr('common.cancel')} variant="ghost" onPress={() => fillAbort.current?.abort()} />
              </View>
            </View>
          ) : (
            <SettingsRow
              first
              icon="sparkles"
              label={tr('fill.title')}
              value={fillCandidates > 0 ? String(fillCandidates) : undefined}
              disabled={fillCandidates === 0}
              onPress={onFill}
            />
          )}
          <SettingsRow icon="document-text" label={tr('settings.exportCsv')} loading={busy === 'exportCsv'} disabled={busy != null && busy !== 'exportCsv'} onPress={onExportCsv} />
        </SettingsGroup>
        <SettingsFootnote>{fillCandidates > 0 || fillProgress ? tr('fill.desc') : tr('fill.none')}</SettingsFootnote>
        <SettingsFootnote>{tr('settings.exportCsvDesc')}</SettingsFootnote>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  howTo: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  tip: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: 12, alignItems: 'flex-start' },
  progress: { padding: spacing.md, gap: spacing.sm },
  progressFoot: { flexDirection: 'row', alignItems: 'center' },
});
