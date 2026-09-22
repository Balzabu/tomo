import assert from 'node:assert/strict';
import { toGoodreadsCsv, CSV_COLUMNS } from '../../src/lib/csvExport.ts';
import { parseCsv } from '../../src/lib/csv.ts';

const ts = new Date(2024, 2, 20, 12).getTime();
const data: any = {
  version: 1, sessions: [], notes: [], goals: [],
  shelves: [{ id: 'sh1', name: 'Sci-fi, classics', color: '#fff', createdAt: 1 }],
  books: [
    { id: 'b1', title: 'Dune', series: 'Dune', seriesNumber: 1, authors: ['Frank Herbert', 'Someone Else'], isbn: '9780441013593', rating: 4.5, pageCount: 412, publishedDate: '1965-08-01', status: 'finished', currentPage: 412, addedAt: ts - 1e9, finishedAt: ts, readCount: 2, reads: [{ finishedAt: ts - 5e9 }], review: 'Great "book",\nreally', shelfIds: ['sh1'], source: 'manual' },
    { id: 'b2', title: 'Emma', authors: [], isbn: '0141439580', status: 'reading', currentPage: 10, addedAt: ts, shelfIds: [], source: 'manual' },
  ],
};
const csv = toGoodreadsCsv(data);
assert.ok(csv.startsWith(CSV_COLUMNS.join(',')));
const rows = parseCsv(csv);
assert.equal(rows.length, 2);
const [d, e] = rows;
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
console.log('csvExport: all assertions passed');
