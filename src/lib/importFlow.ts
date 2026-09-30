import { Alert } from '@/components/AppAlert';
import { AppData } from '@/types';
import { APP_NAME } from '@/lib/constants';
import { INVALID_BACKUP } from '@/lib/backup';
import { didReadFail, PERSIST_FAILED } from '@/lib/storage';
import { deleteCoverFile, isLocalCover } from '@/lib/covers';
import { mergeData } from '@/lib/sync';
import { applyBundle, readImportFile } from '@/lib/importFile';
import { ImportBundle } from '@/lib/importBundle';
import { fillMissingData } from '@/services/catalogRefresh';
import { useStore } from '@/store/useStore';
import type { TFunc } from '@/i18n';

// The whole "import a file" conversation, shared by the Backup screen's
// picker and files shared to Tomo from other apps: recognise the file, say
// what's in it, ask, import, and report what happened.

const SOURCE_NAME: Record<ImportBundle['source'], string> = {
  goodreads: 'Goodreads',
  storygraph: 'StoryGraph',
  bookmory: 'Bookmory',
  openreads: 'Openreads',
};

function ask(title: string, message: string, buttons: { text: string; style?: 'cancel' | 'destructive'; value: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b) => ({ text: b.text, style: b.style, onPress: () => resolve(b.value) })),
      { onDismiss: () => resolve(null) }
    );
  });
}

function plural(tr: TFunc, key: string, n: number): string {
  return n === 1 ? tr(`${key}One`) : tr(key, { n });
}

function failMessage(tr: TFunc, e: unknown): string {
  if (e instanceof Error && e.message === INVALID_BACKUP) return tr('settings.invalidBackup', { app: APP_NAME });
  if (e instanceof Error && e.message === PERSIST_FAILED) return tr('data.saveFailed');
  // Anything else is a damaged/unexpected file: say so, not "TypeError: …".
  console.warn('Import failed', e);
  return tr('import.readFailed');
}

/** Import whatever file `uri` points to. Resolves once the flow is over. */
export async function importFromUri(uri: string, tr: TFunc, opts: { signal?: AbortSignal } = {}): Promise<void> {
  let detected;
  try {
    detected = await readImportFile(uri, { favourites: tr('import.shelfFavourites'), wishlist: tr('import.shelfWishlist') });
  } catch (e) {
    Alert.alert(tr('settings.importFailTitle'), failMessage(tr, e));
    return;
  }
  if (detected.kind === 'unsupported') {
    Alert.alert(tr('settings.importFailTitle'), tr(`import.unsupported.${detected.reason}`));
    return;
  }
  if (detected.kind === 'tomo') {
    await restoreTomo(detected.data, tr);
    return;
  }
  const { bundle } = detected;
  if (bundle.books.length === 0) {
    Alert.alert(tr('settings.importFailTitle'), tr('import.unsupported.empty'));
    return;
  }
  const found = [
    plural(tr, 'import.foundBooks', bundle.books.length),
    bundle.notes.length ? plural(tr, 'import.foundNotes', bundle.notes.length) : '',
    bundle.sessions.length ? plural(tr, 'import.foundSessions', bundle.sessions.length) : '',
  ]
    .filter(Boolean)
    .join(', ');
  const go = await ask(
    tr('import.confirmTitle', { source: SOURCE_NAME[bundle.source] }),
    tr('import.confirmMsg', { found }),
    [
      { text: tr('common.cancel'), style: 'cancel', value: 'no' },
      { text: tr('import.confirm'), value: 'yes' },
    ]
  );
  if (go !== 'yes') return;
  try {
    const r = await applyBundle(bundle);
    const lines = [
      r.added || !r.matched ? plural(tr, 'import.doneBooks', r.added) : '',
      r.matched ? plural(tr, 'import.doneMatched', r.matched) : '',
      r.notes ? plural(tr, 'import.doneNotes', r.notes) : '',
      r.sessions ? plural(tr, 'import.doneSessions', r.sessions) : '',
    ].filter(Boolean);
    Alert.alert(tr('common.done'), lines.join('\n'));
    // Exports carry few covers/page counts: fill the gaps from the ISBNs in
    // the background (best-effort, capped).
    void fillMissingData(r.addedIds, { signal: opts.signal ?? new AbortController().signal, limit: 60 });
  } catch (e) {
    Alert.alert(tr('settings.importFailTitle'), failMessage(tr, e));
  }
}

/** A Tomo backup: merge (default) or replace. */
export async function restoreTomo(imported: AppData, tr: TFunc): Promise<void> {
  const store = useStore.getState();
  // Reading the backup already wrote its covers: not restoring leaves them
  // unreferenced, so drop the ones the library doesn't use.
  const dropImportedCovers = () => {
    const used = new Set(useStore.getState().books.map((b) => b.coverUrl));
    for (const b of imported.books) if (isLocalCover(b.coverUrl) && !used.has(b.coverUrl)) void deleteCoverFile(b.coverUrl);
  };
  let how: string | null = 'replace';
  if (didReadFail()) {
    // The library couldn't be read, so it only *looks* empty: a restore
    // overwrites whatever is still on disk. Say so before doing it.
    const sure = await ask(tr('restore.readFailTitle'), tr('restore.readFailMsg'), [
      { text: tr('common.cancel'), style: 'cancel', value: 'no' },
      { text: tr('restore.replace'), style: 'destructive', value: 'yes' },
    ]);
    if (sure !== 'yes') return dropImportedCovers();
  } else if (store.books.length === 0) {
    // Nothing to lose, but a file shared from another app still deserves a
    // look before it becomes the library.
    const sure = await ask(tr('restore.emptyTitle'), tr(imported.books.length === 1 ? 'restore.emptyMsgOne' : 'restore.emptyMsg', { n: imported.books.length }), [
      { text: tr('common.cancel'), style: 'cancel', value: 'no' },
      { text: tr('restore.restore'), value: 'yes' },
    ]);
    if (sure !== 'yes') return dropImportedCovers();
  } else {
    how = await ask(tr('restore.title'), tr('restore.msg', { n: imported.books.length }), [
      { text: tr('common.cancel'), style: 'cancel', value: 'no' },
      { text: tr('restore.replace'), style: 'destructive', value: 'replace' },
      { text: tr('restore.merge'), value: 'merge' },
    ]);
    if (how === 'replace') {
      const sure = await ask(tr('restore.replaceTitle'), tr('restore.replaceMsg'), [
        { text: tr('common.cancel'), style: 'cancel', value: 'no' },
        { text: tr('restore.replace'), style: 'destructive', value: 'yes' },
      ]);
      if (sure !== 'yes') return dropImportedCovers();
    }
    if (how !== 'replace' && how !== 'merge') return dropImportedCovers();
  }
  try {
    if (how === 'merge') {
      // Deletions made on the other device remove books here too: never
      // silently - show which ones first.
      const { books, sessions, notes, shelves, goals, deleted, version } = useStore.getState();
      const preview = mergeData({ books, sessions, notes, shelves, goals, deleted, version }, imported);
      const kept = new Set(preview.data.books.map((b) => b.id));
      const lost = books.filter((b) => !kept.has(b.id));
      if (lost.length > 0) {
        const titles = lost.slice(0, 5).map((b) => `• ${b.title}`).join('\n') + (lost.length > 5 ? '\n…' : '');
        const sure = await ask(tr('restore.removeTitle'), tr(lost.length === 1 ? 'restore.removeMsgOne' : 'restore.removeMsg', { n: lost.length, titles }), [
          { text: tr('common.cancel'), style: 'cancel', value: 'no' },
          { text: tr('restore.mergeAnyway'), style: 'destructive', value: 'yes' },
        ]);
        if (sure !== 'yes') return dropImportedCovers();
      }
      const { summary, orphanedCovers } = await store.mergeAll(imported);
      orphanedCovers.forEach((u) => void deleteCoverFile(u));
      const parts = [
        summary.booksAdded ? plural(tr, 'restore.sumBooksAdded', summary.booksAdded) : '',
        summary.booksUpdated ? plural(tr, 'restore.sumBooksUpdated', summary.booksUpdated) : '',
        summary.sessionsAdded ? plural(tr, 'restore.sumSessions', summary.sessionsAdded) : '',
        summary.notesAdded ? plural(tr, 'restore.sumNotes', summary.notesAdded) : '',
        lost.length ? plural(tr, 'restore.sumBooksRemoved', lost.length) : '',
      ].filter(Boolean);
      Alert.alert(tr('restore.mergedTitle'), parts.length ? parts.join('\n') : tr('restore.nothingNew'));
    } else if (how === 'replace') {
      const oldCovers = store.books.map((b) => b.coverUrl);
      await store.replaceAll(imported);
      // Only drop old cover files the restored data no longer references.
      const kept = new Set(imported.books.map((b) => b.coverUrl).filter(Boolean));
      oldCovers.forEach((u) => {
        if (u && !kept.has(u)) void deleteCoverFile(u);
      });
      Alert.alert(tr('common.done'), tr('settings.importDoneMsg'));
    }
  } catch (e) {
    dropImportedCovers();
    Alert.alert(tr('settings.importFailTitle'), failMessage(tr, e));
  }
}
