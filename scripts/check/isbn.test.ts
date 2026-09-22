import assert from 'node:assert/strict';
import {
  normalizeIsbn, isbnKey, compactIsbn, looksLikeIsbn, bestIsbn, normalizeBookIsbns, isValidIsbn13, isValidIsbn10,
} from '../../src/lib/isbn.ts';

assert.equal(normalizeIsbn('0-306-40615-2'), '9780306406157');
assert.equal(normalizeIsbn('ISBN-13: 978 0 306 40615 7'), '9780306406157');
assert.equal(normalizeIsbn('ISBN 9780306406157'), '9780306406157');
assert.equal(normalizeIsbn('080442957X'), '9780804429573');
assert.equal(normalizeIsbn('080442957x'), '9780804429573');
assert.equal(normalizeIsbn('="9780306406157"'), '9780306406157'); // goodreads wrapping
assert.equal(normalizeIsbn('9780306406158'), null); // bad checksum
assert.equal(normalizeIsbn('0306406153'), null); // bad checksum isbn10
assert.equal(normalizeIsbn('4006381333931'), null); // valid EAN, not a book
assert.equal(normalizeIsbn('9791234567896'), '9791234567896'); // 979 prefix
assert.equal(normalizeIsbn(''), null);
assert.equal(normalizeIsbn(undefined), null);
assert.equal(isValidIsbn13('9788804668237'), true);
assert.equal(isValidIsbn10('0306406152'), true);
assert.equal(isbnKey('B00XYZ123'), 'X123'.length ? compactIsbn('B00XYZ123') : ''); // compacted raw
assert.equal(isbnKey('  '), undefined);
assert.equal(isbnKey('0-306-40615-2'), isbnKey('9780306406157'));
assert.equal(looksLikeIsbn('9780306406157'), true);
assert.equal(looksLikeIsbn('030640615X'), true);
assert.equal(looksLikeIsbn('12345'), false);
assert.equal(bestIsbn([undefined, '0306406153', '0306406152']), '9780306406157');
assert.equal(bestIsbn(['junk', undefined]), 'junk');
assert.equal(bestIsbn([]), undefined);
const books = [{ isbn: '0306406152', t: 1 }, { isbn: 'junk', t: 2 }, { t: 3 } as { isbn?: string; t: number }];
const r1 = normalizeBookIsbns(books);
assert.equal(r1.changed, true);
assert.equal(r1.books[0].isbn, '9780306406157');
assert.equal(r1.books[1].isbn, 'junk');
assert.equal(r1.books[2], books[2]);
const r2 = normalizeBookIsbns(r1.books);
assert.equal(r2.changed, false);
assert.equal(r2.books, r1.books);
console.log('isbn: all assertions passed');
