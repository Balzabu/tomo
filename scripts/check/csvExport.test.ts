import assert from 'node:assert/strict';
import { toGoodreadsCsv, CSV_COLUMNS } from '../../src/lib/csvExport.ts';
import { parseCsv } from '../../src/lib/csv.ts';
import { parseBookCsv } from '../../src/lib/importSources.ts';

const ts = new Date(2024, 2, 20, 12).getTime();
const data: any = {
  version: 1, sessions: [], notes: [], goals: [],
  shelves: [{ id: 'sh1', name: 'Sci-fi, classics', color: '#fff', createdAt: 1 }],
  books: [
    { id: 'b1', title: 'Dune', series: 'Dune', seriesNumber: 1, authors: ['Frank Herbert', 'Someone Else'], isbn: '9780441013593', rating: 4.5, pageCount: 412, publishedDate: '1965-08-01', status: 'finished', currentPage: 412, addedAt: ts - 1e9, finishedAt: ts, readCount: 2, reads: [{ finishedAt: ts - 5e9 }], review: 'Great "book",\nreally', shelfIds: ['sh1'], source: 'manual' },
    { id: 'b2', title: 'Emma', authors: [], isbn: '0141439580', status: 'reading', currentPage: 10, addedAt: ts, shelfIds: [], source: 'manual' },
    // series without a position, and a title whose parenthesis is its own
    { id: 'b3', title: 'The Silmarillion', series: 'Middle-earth Universe', authors: ['J.R.R. Tolkien'], status: 'want_to_read', currentPage: 0, addedAt: ts, shelfIds: [], source: 'manual' },
    { id: 'b4', title: 'Q (Novel)', authors: ['Luther Blissett'], status: 'want_to_read', currentPage: 0, addedAt: ts, shelfIds: [], source: 'manual' },
  ],
};
const csv = toGoodreadsCsv(data);
assert.ok(csv.startsWith(CSV_COLUMNS.join(',')));
const rows = parseCsv(csv);
assert.equal(rows.length, 4);
const [d, e, s, q] = rows;
assert.equal(d.Title, 'Dune (Dune, #1)');
assert.equal(d.Author, 'Frank Herbert');
assert.equal(d['Additional Authors'], 'Someone Else');
assert.equal(d.ISBN13, '="9780441013593"');
assert.equal(d.ISBN, '');
assert.equal(d['My Rating'], '4.5');
assert.equal(d['Number of Pages'], '412');
assert.equal(d['Year Published'], '1965');
assert.equal(d['Date Read'], '2024/03/20');
assert.equal(d['Exclusive Shelf'], 'read');
assert.equal(d.Bookshelves, 'Sci-fi  classics');
assert.equal(d['My Review'], 'Great "book",\nreally');
assert.equal(d['Read Count'], '2');
assert.equal(e.Title, 'Emma');
assert.equal(e.ISBN, '="0141439580"');
assert.equal(e['Exclusive Shelf'], 'currently-reading');
assert.equal(e['Date Read'], '');
assert.equal(e['My Rating'], '0');
// a series with no number stays out of the title ("Title (Series)" would read
// back as part of the title and change the title|author key) and goes in the
// Series columns instead
assert.equal(s.Title, 'The Silmarillion');
assert.equal(s.Series, 'Middle-earth Universe');
assert.equal(s['Series Number'], '');
assert.equal(d.Series, 'Dune');
assert.equal(d['Series Number'], '1');
assert.equal(q.Title, 'Q (Novel)');
assert.equal(q.Series, '');

// round trip through the importer: titles, series and keys survive intact
const back = parseBookCsv(csv)!;
assert.equal(back.source, 'goodreads');
const by = (t: string) => back.books.find((b) => b.title === t)!;
assert.deepEqual([by('Dune').series, by('Dune').seriesNumber], ['Dune', 1]);
assert.equal(by('Dune').isbn, '9780441013593');
assert.deepEqual(by('Dune').authors, ['Frank Herbert', 'Someone Else']);
assert.deepEqual([by('The Silmarillion').series, by('The Silmarillion').seriesNumber], ['Middle-earth Universe', undefined]);
assert.deepEqual(by('The Silmarillion').authors, ['J.R.R. Tolkien']);
assert.ok(by('Q (Novel)'), 'a parenthesised title is not taken for a series in our own export');
assert.equal(by('Q (Novel)').series, undefined);
assert.equal(by('Emma').status, 'reading');
console.log('csvExport: all assertions passed');
