// Page counts parsed from catalogue text. Pure module (no app imports) so the
// check scripts can run it under plain Node.

// Anything outside this range is a cataloguing slip, not a real book length.
const MAX_PAGES = 20_000;

// The extent before "p." names a carrier that isn't one book: several
// volumes ("2 v. (345, 410 p.)" - the largest volume, not the book; "1 v.
// (300 p.)" is fine, that is how some catalogues write a single volume), or
// media with a booklet ("1 CD-ROM (120 p.)").
const NOT_ONE_BOOK =
  /(?:[2-9]|\d{2,})\s*v(?:ol(?:s|umes?)?)?\b\.?|\b(?:CD(?:-ROM)?s?|DVDs?|Blu-ray|audio\w*|cassettes?|discs?|videodiscs?|microfiches?|microfilms?)\b/i;

/**
 * Page count from an SBN/ISBD physical description, e.g.
 *   "445 p. ; 20 cm"          → 445
 *   "XII, 380 p. : ill."      → 380
 *   "445, [3] p. ; 21 cm"     → 445
 *   "2 v. ; 24 cm"            → undefined (volumes, not pages)
 * Takes the extent before the first "p." and returns its largest arabic
 * number - roman front matter and bracketed blank leaves are ignored.
 */
export function pagesFromPhysicalDescription(desc?: string): number | undefined {
  if (!desc) return undefined;
  const m = /^(.*?)\bp\./i.exec(desc);
  if (!m || NOT_ONE_BOOK.test(m[1])) return undefined;
  const nums = (m[1].match(/\d+/g) ?? []).map(Number);
  const n = nums.length ? Math.max(...nums) : 0;
  return n > 0 && n <= MAX_PAGES ? n : undefined;
}

/** A usable page count, or undefined for 0 / NaN / absurd values. */
export function validPageCount(n?: number): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_PAGES
    ? Math.round(n)
    : undefined;
}
