import { Image } from 'expo-image';
import { Book } from '@/types';
import { lookupByIsbn } from '@/services/bookApi';
import { useStore } from '@/store/useStore';
import {
  checkedIsbnAfterLookup,
  fillEmptyPatch,
  needsCatalogData,
  pickValues,
  RefreshValues,
  valuesOfResult,
} from '@/lib/bookRefresh';

export type CatalogOutcome =
  | { status: 'ok'; values: RefreshValues }
  | { status: 'offline' }
  | { status: 'notfound' };

const COVER_CHECK_MS = 8000;

// Catalogue covers are partly guesses (an Open Library cover-by-ISBN URL 404s
// when there is no cover), so only a cover that actually downloads is offered
// - and it is then already in the image cache for the preview.
async function coverLoads(url: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Image.prefetch(url),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), COVER_CHECK_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Catalogue data for an ISBN, cover verified. `checkCover: false` drops the
 * cover instead of downloading it (the caller doesn't want one).
 */
export async function fetchCatalogValues(
  isbn: string,
  opts?: { signal?: AbortSignal; checkCover?: boolean }
): Promise<CatalogOutcome> {
  const { result, offline } = await lookupByIsbn(isbn, { signal: opts?.signal });
  if (!result) return { status: offline ? 'offline' : 'notfound' };
  const values = valuesOfResult(result);
  if (values.coverUrl && (opts?.checkCover === false || !(await coverLoads(values.coverUrl)))) {
    values.coverUrl = undefined;
  }
  return { status: 'ok', values };
}

export function booksNeedingData(books: Book[]): Book[] {
  return books.filter(needsCatalogData);
}

export interface FillProgress {
  done: number;
  total: number;
  updated: number;
}

export interface FillResult extends FillProgress {
  /** why the run ended early: connection lost, or cancelled by the caller */
  stopped: 'offline' | 'cancelled' | null;
}

// Paces the chain: Open Library throttles long bursts.
const PACE_MS = 300;
// Write every few books, so a cancelled or interrupted run keeps its work
// without one full-DB write per book.
const FLUSH_EVERY = 5;

/**
 * Fill empty fields (cover, pages, authors, publisher...) of the given books
 * from the catalogues. Never overwrites a value the book has - the check runs
 * against the book as it is at write time, so edits made meanwhile win.
 * Stops at the first lookup that finds the catalogues unreachable.
 */
export async function fillMissingData(
  ids: string[],
  opts: { signal: AbortSignal; onProgress?: (p: FillProgress) => void; limit?: number }
): Promise<FillResult> {
  const { signal, onProgress } = opts;
  const wanted = new Set(ids);
  const targets = booksNeedingData(useStore.getState().books)
    .filter((b) => wanted.has(b.id))
    .slice(0, opts.limit ?? Infinity);
  const progress: FillProgress = { done: 0, total: targets.length, updated: 0 };
  let stopped: FillResult['stopped'] = null;
  // values null: the catalogues don't know the ISBN
  let pending: { id: string; values: RefreshValues | null }[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const books = useStore.getState().books;
    const patches: { id: string; patch: Partial<Book> }[] = [];
    for (const p of pending) {
      const b = books.find((x) => x.id === p.id);
      if (!b) continue; // deleted meanwhile
      const patch: Partial<Book> = p.values ? fillEmptyPatch(pickValues(b), p.values) : {};
      const filled = Object.keys(patch).length > 0;
      // Still incomplete after this lookup: remember it, so neither the
      // count nor the book page keeps offering a lookup that can't help.
      const checked = checkedIsbnAfterLookup({ ...b, ...patch }, p.values);
      if (checked) patch.catalogCheckedIsbn = checked;
      if (Object.keys(patch).length > 0) patches.push({ id: b.id, patch });
      if (filled) progress.updated++;
    }
    pending = [];
    useStore.getState().updateBooks(patches);
  };

  for (const b of targets) {
    if (signal.aborted) {
      stopped = 'cancelled';
      break;
    }
    const out = await fetchCatalogValues(b.isbn!, { signal, checkCover: !b.coverUrl });
    if (signal.aborted) {
      stopped = 'cancelled';
      break;
    }
    if (out.status === 'offline') {
      stopped = 'offline';
      break;
    }
    pending.push({ id: b.id, values: out.status === 'ok' ? out.values : null });
    progress.done++;
    if (pending.length >= FLUSH_EVERY) flush();
    onProgress?.({ ...progress });
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  flush();
  onProgress?.({ ...progress });
  return { ...progress, stopped };
}
