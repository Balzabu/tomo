import assert from 'node:assert/strict';
import { parseCsv } from '../../src/lib/csv.ts';
const rows = parseCsv('﻿Title,Author,Note\n"Dune, Part 1",Herbert,"a ""quoted"" note\nwith newline"\n5\'10" tall,Someone,plain\nlast,row,here\n');
assert.equal(rows.length, 3);
assert.equal(rows[0].Title, 'Dune, Part 1');           // BOM stripped by trim()
assert.equal(rows[0].Note, 'a "quoted" note\nwith newline');
assert.equal(rows[1].Title, '5\'10" tall');            // mid-field quote literal
assert.equal(rows[1].Note, 'plain');
assert.equal(rows[2].Title, 'last');                   // parser did not swallow the rest
console.log('csv: all assertions passed');
