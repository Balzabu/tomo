// ISBN helpers - pure and dependency-free so they can be unit-checked under
// plain node (`node --experimental-strip-types`).
//
// Policy: a book's stored `isbn` is the canonical ISBN-13 whenever the value
// validates. Values that don't (bad checksum, an ASIN, junk from a CSV) are
// kept as-is rather than dropped - they may still be useful to the user - and
// every comparison goes through `isbnKey`, which normalises when it can.

/** Strip "ISBN", "ISBN-10:", "ISBN13" prefixes, spaces, hyphens and
 *  Goodreads' `="..."` wrapping; uppercase a trailing x. */
export function compactIsbn(raw: string): string {
  return raw
    .trim()
    .replace(/^isbn(?:-?1[03])?\s*:?\s*/i, '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
}

/** Shape check only (13 digits, or 9 digits + digit/X) - no checksum. */
export function looksLikeIsbn(compact: string): boolean {
  return /^\d{13}$/.test(compact) || /^\d{9}[\dX]$/.test(compact);
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const v = ch === 'X' ? 10 : Number(ch);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** EAN-13 checksum AND a book prefix (978/979) - a grocery barcode is a valid
 *  EAN but not an ISBN. */
export function isValidIsbn13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  return ean13CheckDigit(s.slice(0, 12)) === Number(s[12]);
}

/** Convert a (valid) ISBN-10 to its ISBN-13 form. */
export function isbn10To13(isbn10: string): string {
  const core = `978${isbn10.slice(0, 9)}`;
  return `${core}${ean13CheckDigit(core)}`;
}

/** Canonical ISBN-13 for any ISBN-10/13 spelling, or null when the value is
 *  not a valid ISBN. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = compactIsbn(raw);
  if (isValidIsbn13(c)) return c;
  if (isValidIsbn10(c)) return isbn10To13(c);
  return null;
}

export function isValidIsbn(raw: string | null | undefined): boolean {
  return normalizeIsbn(raw) !== null;
}

/** Comparison key: the canonical ISBN-13 when valid, otherwise the compacted
 *  raw string (so two copies of the same unparseable id still match), or
 *  undefined when there is nothing to compare. */
export function isbnKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const n = normalizeIsbn(raw);
  if (n) return n;
  const c = compactIsbn(raw);
  return c || undefined;
}

/** What gets *stored*: the canonical ISBN-13 when the value validates,
 *  otherwise the trimmed raw string (never drop user data over a checksum),
 *  or undefined when there is nothing. */
export function keepIsbn(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return normalizeIsbn(raw) ?? (raw.trim() || undefined);
}

/** First candidate that normalises; otherwise the first non-empty one. */
export function bestIsbn(candidates: (string | undefined | null)[]): string | undefined {
  for (const c of candidates) {
    const n = normalizeIsbn(c);
    if (n) return n;
  }
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return undefined;
}

/** One-shot, idempotent normalisation of stored books. Returns the same array
 *  reference (and changed=false) when nothing needed to change, so callers can
 *  skip a persist. */
export function normalizeBookIsbns<T extends { isbn?: string }>(
  books: T[]
): { books: T[]; changed: boolean } {
  let changed = false;
  const out = books.map((b) => {
    if (!b.isbn) return b;
    const n = normalizeIsbn(b.isbn);
    if (!n || n === b.isbn) return b;
    changed = true;
    return { ...b, isbn: n };
  });
  return { books: changed ? out : books, changed };
}
