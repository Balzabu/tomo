import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { isOpenreadsBackup, parseOpenreadsBackup, parseOpenreadsCsv, isOpenreadsCsv } from '../../src/lib/importOpenreads.ts';
import { parseBookmoryEntries, parseBookmoryXlsx, isBookmoryXlsx, quillToText } from '../../src/lib/importBookmory.ts';
import { splitReads, bytesToBase64, base64ToBytes, utf8Decode } from '../../src/lib/importBundle.ts';
import { toDateKey } from '../../src/lib/utils.ts';

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
console.log('imports: all assertions passed');
