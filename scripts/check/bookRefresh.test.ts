import assert from 'node:assert/strict';
import {
  diffBook, defaultSelection, patchFrom, fillEmptyPatch, needsCatalogData, pickValues, checkedIsbnAfterLookup,
} from '../../src/lib/bookRefresh.ts';

const book = { title: 'Il cerchio', authors: ['Dave  eggers'], pageCount: undefined, coverUrl: undefined, publisher: 'Feltrinelli' };
const cat = {
  title: 'Il cerchio / Dave Eggers ; traduzione di V. Mantovani',
  authors: ['Dave Eggers'],
  pageCount: 445,
  coverUrl: 'https://books.google.com/x.jpg',
  publisher: '',
  description: 'Romanzo',
};

// fills vs changes; loose compare on authors; empty incoming never clears
const d = diffBook(book, cat);
assert.deepEqual(d.map((x) => [x.field, x.kind]), [
  ['coverUrl', 'fill'], ['title', 'change'], ['pageCount', 'fill'], ['description', 'fill'],
]);
assert.deepEqual([...defaultSelection(d)].sort(), ['coverUrl', 'description', 'pageCount']);

// default patch: fills only
assert.deepEqual(patchFrom(d, defaultSelection(d), book), { coverUrl: cat.coverUrl, pageCount: 445, description: 'Romanzo' });
// opting into the change
assert.equal(patchFrom(d, new Set(['title'] as const), book).title, cat.title);
// a field edited since the diff was shown is left alone
assert.deepEqual(patchFrom(d, defaultSelection(d), { ...book, pageCount: 450 }), { coverUrl: cat.coverUrl, description: 'Romanzo' });
assert.deepEqual(patchFrom(d, new Set(['title'] as const), { ...book, title: 'Altro' }), {});

// nothing to do
assert.deepEqual(diffBook(cat, cat), []);
assert.deepEqual(diffBook({ pageCount: 445 }, { pageCount: 0 }), []);
// cover URLs compare exactly; a local custom cover is a 'change', never a fill
assert.equal(diffBook({ coverUrl: 'file:///covers/a.jpg' }, { coverUrl: 'https://x/a.jpg' })[0].kind, 'change');
assert.deepEqual(diffBook({ coverUrl: 'https://x/A.jpg' }, { coverUrl: 'https://x/A.jpg' }), []);
// blank strings / arrays count as empty
assert.equal(diffBook({ authors: ['  '] }, { authors: ['X'] })[0].kind, 'fill');
assert.equal(diffBook({ title: '   ' }, { title: 'T' })[0].kind, 'fill');

// silent bulk fill: never touches what the user has
assert.deepEqual(fillEmptyPatch(book, cat), { coverUrl: cat.coverUrl, pageCount: 445, description: 'Romanzo' });
assert.deepEqual(fillEmptyPatch(cat, { ...cat, title: 'Other', pageCount: 1 }), {});

// who is worth a lookup
const I = '978-88-07-89683-5';
assert.equal(needsCatalogData({ isbn: I, coverUrl: 'x', pageCount: 3, authors: ['a'] }), false);
assert.equal(needsCatalogData({ isbn: I, coverUrl: 'x', pageCount: 3, authors: [] }), true);
assert.equal(needsCatalogData({ isbn: I, pageCount: 3, authors: ['a'] }), true);
assert.equal(needsCatalogData({ isbn: '0306406152', pageCount: 3, authors: ['a'] }), true); // ISBN-10
assert.equal(needsCatalogData({ isbn: 'B00XYZ123', authors: [] }), false); // ASIN, not an ISBN
assert.equal(needsCatalogData({ isbn: '978', authors: [] }), false);
assert.equal(needsCatalogData({ isbn: ' ', authors: [] }), false);
assert.equal(needsCatalogData({ authors: [] }), false);

// an ISBN already checked with nothing more to offer is not asked again...
assert.equal(needsCatalogData({ isbn: I, authors: ['a'], catalogCheckedIsbn: '9788807896835' }), false);
assert.equal(needsCatalogData({ isbn: '8807896834', authors: ['a'], catalogCheckedIsbn: I }), false); // ISBN-10 of the same
// ...but a different ISBN (the user fixed it) is
assert.equal(needsCatalogData({ isbn: '9780141439518', authors: ['a'], catalogCheckedIsbn: I }), true);

// what a lookup leaves behind
const incomplete = { isbn: I, authors: ['a'], title: 'T' };
assert.equal(checkedIsbnAfterLookup(incomplete, null), I); // unknown ISBN
assert.equal(checkedIsbnAfterLookup(incomplete, { title: 'X', publisher: 'P' }), I); // nothing that completes it
assert.equal(checkedIsbnAfterLookup(incomplete, { coverUrl: 'c', pageCount: 3 }), undefined); // it completes it
assert.equal(checkedIsbnAfterLookup(incomplete, { coverUrl: 'c' }), undefined); // offers the cover: keep offering
assert.equal(checkedIsbnAfterLookup({ ...incomplete, coverUrl: 'c' }, { coverUrl: 'c', title: 'X' }), I); // cover taken, pages nowhere
assert.equal(checkedIsbnAfterLookup({ isbn: I, authors: ['a'], coverUrl: 'c', pageCount: 3 }, null), undefined); // complete already
assert.equal(checkedIsbnAfterLookup({ authors: [] }, null), undefined); // no ISBN

// pickValues drops non-refresh fields
assert.deepEqual(pickValues({ title: 'T', ...({ status: 'reading', isbn: '1' } as object) }), { title: 'T' });
console.log('bookRefresh: all assertions passed');
