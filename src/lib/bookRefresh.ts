// Catalogue refresh: compare a book with a catalogue result field by field.
// Pure (type-only imports) so the check scripts run it under plain Node.
//
// Catalogues are not always better than what the user typed (placeholder
// titles, "Title / Author ; translator" strings, other editions), so nothing
// here overwrites blindly: a field the book lacks is a 'fill', a field that
// differs is a 'change', and only fills are pre-selected. Only fields the app
// shows or uses are refreshed (the catalogue language, for one, is not).
import type { BookSearchResult } from '@/types';
import { compactIsbn, looksLikeIsbn, normalizeIsbn } from './isbn.ts';

export const REFRESH_FIELDS = [
  'coverUrl',
  'title',
  'authors',
  'pageCount',
  'publisher',
  'publishedDate',
  'description',
  'categories',
] as const;

export type RefreshField = (typeof REFRESH_FIELDS)[number];

export interface RefreshValues {
  coverUrl?: string;
  title?: string;
  authors?: string[];
  pageCount?: number;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  categories?: string[];
}

type Value = RefreshValues[RefreshField];

export interface FieldDiff {
  field: RefreshField;
  current: Value;
  incoming: Value;
  /** 'fill': the book has nothing there; 'change': it holds a different value */
  kind: 'fill' | 'change';
}

/** The refreshable fields of a book (or of a draft of one). */
export function pickValues(src: RefreshValues): RefreshValues {
  const out: RefreshValues = {};
  for (const f of REFRESH_FIELDS) {
    if (src[f] !== undefined) (out as Record<string, Value>)[f] = src[f];
  }
  return out;
}

export function valuesOfResult(r: BookSearchResult): RefreshValues {
  return pickValues(r);
}

function isEmpty(v: Value): boolean {
  if (v == null) return true;
  if (typeof v === 'number') return !(v > 0);
  if (Array.isArray(v)) return v.every((x) => !x.trim());
  return !v.trim();
}

// Case/whitespace-insensitive, so "dave  eggers" vs "Dave Eggers" is not a change.
function norm(v: Value): string {
  if (v == null || isEmpty(v)) return '';
  if (typeof v === 'number') return String(v);
  const s = Array.isArray(v) ? v.map((x) => x.trim()).filter(Boolean).join('|') : v;
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function same(field: RefreshField, a: Value, b: Value): boolean {
  // URLs are case-sensitive; everything else compares loosely.
  if (field === 'coverUrl') return (isEmpty(a) ? '' : a) === (isEmpty(b) ? '' : b);
  return norm(a) === norm(b);
}

export function diffBook(current: RefreshValues, incoming: RefreshValues): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of REFRESH_FIELDS) {
    const inc = incoming[field];
    if (isEmpty(inc)) continue; // the catalogue can't clear a field
    const cur = current[field];
    if (isEmpty(cur)) diffs.push({ field, current: undefined, incoming: inc, kind: 'fill' });
    else if (!same(field, cur, inc)) diffs.push({ field, current: cur, incoming: inc, kind: 'change' });
  }
  return diffs;
}

export function defaultSelection(diffs: FieldDiff[]): Set<RefreshField> {
  return new Set(diffs.filter((d) => d.kind === 'fill').map((d) => d.field));
}

/**
 * The patch for the selected fields. `now` is the book as it is at apply
 * time: a field that changed since the diff was shown (the user typed, or a
 * background job filled it) is left alone rather than overwritten.
 */
export function patchFrom(
  diffs: FieldDiff[],
  selected: ReadonlySet<RefreshField>,
  now: RefreshValues
): RefreshValues {
  const patch: RefreshValues = {};
  for (const d of diffs) {
    if (!selected.has(d.field)) continue;
    if (!same(d.field, now[d.field], d.current)) continue;
    (patch as Record<string, Value>)[d.field] = d.incoming;
  }
  return patch;
}

/** Only the fields the book lacks - safe to apply without asking. */
export function fillEmptyPatch(current: RefreshValues, incoming: RefreshValues): RefreshValues {
  const diffs = diffBook(current, incoming);
  return patchFrom(diffs, defaultSelection(diffs), current);
}

function lookupKey(isbn: string): string {
  return normalizeIsbn(isbn) ?? compactIsbn(isbn);
}

export type CatalogCandidate = RefreshValues & { isbn?: string; catalogCheckedIsbn?: string };

/** Worth a catalogue lookup: has a usable ISBN, lacks a cover, length or
 *  author, and that ISBN hasn't already come back with nothing more. */
export function needsCatalogData(b: CatalogCandidate): boolean {
  if (!b.isbn || !looksLikeIsbn(lookupKey(b.isbn))) return false;
  if (b.catalogCheckedIsbn && lookupKey(b.catalogCheckedIsbn) === lookupKey(b.isbn)) return false;
  return isEmpty(b.coverUrl) || isEmpty(b.pageCount) || isEmpty(b.authors);
}

const ESSENTIAL: RefreshField[] = ['coverUrl', 'pageCount', 'authors'];

/**
 * After a lookup (`incoming` null = ISBN unknown to the catalogues): the ISBN
 * to record as checked when the catalogues have none of the missing cover,
 * length or author to offer, otherwise undefined - a book they could still
 * complete keeps being offered until that data is taken.
 */
export function checkedIsbnAfterLookup(b: CatalogCandidate, incoming: RefreshValues | null): string | undefined {
  if (!needsCatalogData(b)) return undefined;
  const fills = incoming ? fillEmptyPatch(pickValues(b), incoming) : {};
  return ESSENTIAL.some((f) => f in fills) ? undefined : b.isbn;
}
