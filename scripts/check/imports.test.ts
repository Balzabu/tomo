import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { isOpenreadsBackup, parseOpenreadsBackup, parseOpenreadsCsv, isOpenreadsCsv } from '../../src/lib/importOpenreads.ts';
import { parseBookmoryEntries, parseBookmoryXlsx, isBookmoryXlsx, quillToText } from '../../src/lib/importBookmory.ts';
import { splitReads, bytesToBase64, base64ToBytes, utf8Decode } from '../../src/lib/importBundle.ts';
import { toDateKey } from '../../src/lib/utils.ts';
import { parseBookCsv } from '../../src/lib/importSources.ts';
import { sniffDelimiter } from '../../src/lib/csv.ts';

const fx = (f: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', f));
const labels = { favourites: 'Preferiti', wishlist: 'Lista desideri' };
const key = (ts?: number) => (ts ? toDateKey(ts) : undefined);

// helpers
{
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
  for (let n = 0; n <= bytes.length; n++) {
    const b = bytes.subarray(0, n);
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'));
    assert.deepEqual([...base64ToBytes(Buffer.from(b).toString('base64'))], [...b]);
  }
  assert.equal(utf8Decode(new TextEncoder().encode('﻿città 📚')), 'città 📚');
  assert.equal(utf8Decode(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0xf0])), 'M\uFFFDller\uFFFD', 'Latin-1 bytes do not throw');
  const s = splitReads([{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 5 }], false);
  assert.deepEqual(s, { startedAt: 5, reads: [{ startedAt: 1, finishedAt: 2 }, { startedAt: 3, finishedAt: 4 }], readCount: 2 });
  assert.deepEqual(splitReads([{ start: 1, end: 2 }, { start: 3, end: 4 }], true), { startedAt: 3, finishedAt: 4, reads: [{ startedAt: 1, finishedAt: 2 }], readCount: 2 });
}

// Openreads backup (real v5 file; Android saves it as .backup.zip)
{
  const files = unzipSync(new Uint8Array(fx('openreads.backup')));
  assert.ok(isOpenreadsBackup(files));
  const b = parseOpenreadsBackup(files, labels);
  assert.equal(b.books.length, 3);
  const baron = b.books.find((x) => x.title === 'Il barone rampante')!;
  assert.equal(baron.status, 'finished'); assert.equal(baron.rating, 4); assert.equal(baron.pageCount, 280); assert.equal(baron.currentPage, 280);
  assert.equal(baron.isbn, '9788804668220'); assert.deepEqual(baron.shelfNames, ['classici']); assert.equal(baron.review, 'Un classico leggero e profondo');
  assert.equal(key(baron.startedAt), '2026-09-02'); assert.equal(key(baron.finishedAt), '2026-09-20'); assert.equal(baron.readCount, 1);
  assert.equal(b.books.find((x) => x.title === 'Dune')!.status, 'reading');
  assert.equal(b.books.find((x) => x.title === 'Seta')!.status, 'want_to_read');
  assert.equal(b.notes.length, 1); assert.equal(b.notes[0].text, 'Cosimo sugli alberi'); assert.equal(b.notes[0].bookKey, baron.key);
}

// Openreads CSV
{
  const text = fx('openreads.csv').toString('utf8');
  assert.ok(isOpenreadsCsv(text.split('\n')[0].split(',')));
  const b = parseOpenreadsCsv(text, labels);
  assert.equal(b.books.length, 3);
  const baron = b.books.find((x) => x.title === 'Il barone rampante')!;
  assert.equal(baron.rating, 4); assert.equal(key(baron.finishedAt), '2026-09-20'); assert.equal(b.books[2].status, 'want_to_read');
}

// Bookmory database rows (from the real Database.bookmory)
{
  const rows = JSON.parse(fx('bookmory-entries.json').toString('utf8'));
  const b = parseBookmoryEntries(rows, labels);
  assert.equal(b.books.length, 12);
  const dune = b.books.find((x) => x.title === 'Dune')!;
  assert.equal(dune.status, 'reading'); assert.equal(dune.currentPage, 45); assert.equal(dune.pageCount, 880);
  assert.equal(dune.reads?.length, 1, 'the first (finished) read is history'); assert.equal(dune.readCount, 1); assert.ok(dune.startedAt);
  assert.equal(dune.rating, 5);
  const s = b.sessions.filter((x) => x.bookKey === dune.key);
  assert.equal(s.length, 1); assert.equal(s[0].durationSeconds, 1500); assert.equal(s[0].pagesRead, 45); assert.equal(s[0].endPage, 45);
  const orwell = b.books.find((x) => x.title === '1984')!;
  assert.equal(orwell.status, 'finished'); assert.equal(orwell.rating, 5); assert.ok(orwell.coverUrl?.startsWith('https://'));
  assert.equal(key(orwell.finishedAt), key(1757635200000));
  const gatto = b.books.find((x) => x.title === 'Il Gattopardo')!;
  assert.equal(gatto.review, 'Bellissimo, da rileggere.');
  assert.equal(b.notes.length, 1); assert.equal(b.notes[0].type, 'quote'); assert.equal(b.notes[0].page, 72);
  assert.equal(b.notes[0].text, 'L essenziale e invisibile agli occhi');
  assert.equal(b.books.find((x) => x.key === b.notes[0].bookKey)!.title, 'Il piccolo principe');
  assert.equal(quillToText('[{"insert":"a"},{"insert":"b\\n"}]'), 'ab');
}

// Bookmory Excel (real export, English)
{
  const files = unzipSync(new Uint8Array(fx('bookmory.xlsx')));
  assert.ok(isBookmoryXlsx(files));
  const b = parseBookmoryXlsx(files, labels);
  assert.equal(b.books.length, 12);
  const orwell = b.books.find((x) => x.title === '1984')!;
  assert.equal(orwell.status, 'finished'); assert.equal(orwell.pageCount, 333); assert.equal(orwell.rating, 5);
  assert.equal(key(orwell.startedAt), '2025-08-08'); assert.equal(key(orwell.finishedAt), '2025-09-12');
  assert.equal(b.books.find((x) => x.title === 'Il Gattopardo')!.review, 'Bellissimo, da rileggere.');
  assert.equal(b.notes.length, 1); assert.equal(b.notes[0].type, 'quote'); assert.equal(b.notes[0].page, 72);
  assert.equal(b.books.find((x) => x.key === b.notes[0].bookKey)!.title, 'Il piccolo principe');
}

// Goodreads / StoryGraph CSV re-saved by a European Excel: ";" separated,
// "," as the decimal mark, ";" inside quoted titles
{
  const g = parseBookCsv(fx('goodreads-semicolon.csv').toString('utf8'))!;
  assert.equal(g.source, 'goodreads');
  assert.equal(g.books.length, 4);
  const dune = g.books.find((b) => b.title === 'Dune')!;
  assert.deepEqual([dune.series, dune.seriesNumber, dune.isbn, dune.rating, dune.pageCount], ['Dune', 1, '9780441013593', 5, 412]);
  assert.deepEqual(dune.shelfNames, ['classici', 'fantascienza']);
  assert.equal(dune.status, 'finished');
  assert.equal(key(dune.finishedAt), '2026-03-14');
  // Goodreads writes a series with no position as "Title (Series)"
  const hobbit = g.books.find((b) => b.title === 'The Hobbit')!;
  assert.deepEqual([hobbit.series, hobbit.seriesNumber], ['Middle-earth Universe', undefined]);
  // ...but an edition note in parentheses stays in the title
  const pride = g.books.find((b) => b.title === 'Pride and Prejudice (Penguin Classics Deluxe Edition)')!;
  assert.equal(pride.series, undefined);
  const rosa = g.books.find((b) => b.title === 'Il nome della rosa; ovvero, un romanzo')!;
  assert.equal(rosa.status, 'reading'); assert.equal(rosa.isbn, '9788845292613');

  const s = parseBookCsv(fx('storygraph-semicolon.csv').toString('utf8'))!;
  assert.equal(s.source, 'storygraph');
  assert.equal(s.books.length, 2);
  const sd = s.books.find((b) => b.title === 'Dune')!;
  assert.deepEqual([sd.series, sd.seriesNumber, sd.rating, sd.pace], ['Dune', 1, 5, 'slow']);
  assert.deepEqual(sd.moods, ['adventurous', 'tense']); assert.deepEqual(sd.shelfNames, ['sci-fi', 'classics']);
  assert.equal(key(sd.startedAt), '2026-02-01'); assert.equal(key(sd.finishedAt), '2026-03-14');
  const sr = s.books.find((b) => b.title === 'Il nome della rosa; ovvero, un romanzo')!;
  assert.equal(sr.status, 'reading'); assert.equal(key(sr.startedAt), '2026-10-01');

  // the Openreads detection splits the header the same way
  const header = fx('openreads.csv').toString('utf8').split('\n')[0].replace(/,/g, ';');
  assert.ok(isOpenreadsCsv(header.split(sniffDelimiter(header))));
  assert.ok(!isOpenreadsCsv(header.split(',')));
}

// "Title (Series)" without a number: only in Goodreads's own export (it has
// "Author l-f"), and only when the parenthesis looks like a series name
{
  const gr = (titles: string[], proper = true) =>
    parseBookCsv(
      `Book Id,Title,Author${proper ? ',Author l-f' : ''},Exclusive Shelf\n` +
        titles.map((t, i) => `${i},"${t}",A${proper ? ',"A"' : ''},to-read`).join('\n') + '\n'
    )!.books.map((b) => [b.title, b.series, b.seriesNumber]);
  assert.deepEqual(
    gr(['The Hobbit (Middle-earth Universe)', 'Dune (Dune, #1)', 'Q (novel)', 'Nineteen Eighty-Four (1984)', 'Il nome della rosa (Edizione speciale)', 'Dune (Spanish Edition)', 'Dune (Vol. 2)', 'Foundation (The Foundation Trilogy)']),
    [
      ['The Hobbit', 'Middle-earth Universe', undefined],
      ['Dune', 'Dune', 1],
      ['Q (novel)', undefined, undefined],
      ['Nineteen Eighty-Four (1984)', undefined, undefined],
      ['Il nome della rosa (Edizione speciale)', undefined, undefined],
      ['Dune (Spanish Edition)', undefined, undefined],
      ['Dune (Vol. 2)', undefined, undefined],
      ['Foundation', 'The Foundation Trilogy', undefined],
    ]
  );
  // a Goodreads-style file from another app (no "Author l-f"): only numbered series
  assert.deepEqual(gr(['The Hobbit (Middle-earth Universe)', 'Dune (Dune, #1)'], false), [
    ['The Hobbit (Middle-earth Universe)', undefined, undefined],
    ['Dune', 'Dune', 1],
  ]);
}
console.log('imports: all assertions passed');
