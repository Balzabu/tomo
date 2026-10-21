import assert from 'node:assert/strict';
import { parseCsv, sniffDelimiter } from '../../src/lib/csv.ts';
const rows = parseCsv('﻿Title,Author,Note\n"Dune, Part 1",Herbert,"a ""quoted"" note\nwith newline"\n5\'10" tall,Someone,plain\nlast,row,here\n');
assert.equal(rows.length, 3);
assert.equal(rows[0].Title, 'Dune, Part 1');           // BOM stripped by trim()
assert.equal(rows[0].Note, 'a "quoted" note\nwith newline');
assert.equal(rows[1].Title, '5\'10" tall');            // mid-field quote literal
assert.equal(rows[1].Note, 'plain');
assert.equal(rows[2].Title, 'last');                   // parser did not swallow the rest

// a quote after padding still opens the field (some spreadsheets write `a, "b"`)
{
  const r = parseCsv('A,B,C\n x, "y, z",w\n');
  assert.equal(r.length, 1);
  assert.equal(r[0].A, 'x');
  assert.equal(r[0].B, 'y, z');
  assert.equal(r[0].C, 'w');
}

// delimiter sniffed from the header: ";" (European Excel) and tab
assert.equal(sniffDelimiter('Title,Author,Note'), ',');
assert.equal(sniffDelimiter('Title;Author;Note'), ';');
assert.equal(sniffDelimiter('Title\tAuthor\tNote'), '\t');
assert.equal(sniffDelimiter('"Title; or, subtitle",Author,Note'), ','); // inside quotes doesn't count
assert.equal(sniffDelimiter('Title'), ',');
{
  const r = parseCsv('Title;Author;Note\n"Rosa; ovvero, un romanzo";Eco;"4,5 stars"\nDune;Herbert;plain, note\n');
  assert.equal(r.length, 2);
  assert.equal(r[0].Title, 'Rosa; ovvero, un romanzo');
  assert.equal(r[0].Author, 'Eco');
  assert.equal(r[0].Note, '4,5 stars');
  assert.equal(r[1].Note, 'plain, note');             // a comma is just text now
  const t = parseCsv('Title\tAuthor\nDune, Part 1\tHerbert\n');
  assert.equal(t[0].Title, 'Dune, Part 1');
}
// a "," file keeps ";" inside (and outside) quoted fields as text
{
  const r = parseCsv('Title,Author\n"Rosa; ovvero, un romanzo",Eco\nA; B,C\n');
  assert.equal(r[0].Title, 'Rosa; ovvero, un romanzo');
  assert.equal(r[0].Author, 'Eco');
  assert.equal(r[1].Title, 'A; B');
}
console.log('csv: all assertions passed');
