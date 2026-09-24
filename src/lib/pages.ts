// Page counts parsed from catalogue text. Pure module (no app imports) so the
// check scripts can run it under plain Node.

// Anything outside this range is a cataloguing slip, not a real book length.
const MAX_PAGES = 20_000;

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
  if (!m) return undefined;
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
