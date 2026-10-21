import assert from 'node:assert/strict';
import { pagesFromPhysicalDescription, validPageCount } from '../../src/lib/pages.ts';

assert.equal(pagesFromPhysicalDescription('445 p. ; 20 cm'), 445);
assert.equal(pagesFromPhysicalDescription('XII, 380 p. : ill. ; 24 cm'), 380);
assert.equal(pagesFromPhysicalDescription('445, [3] p. ; 21 cm'), 445);
assert.equal(pagesFromPhysicalDescription('[4], 212 p.'), 212);
assert.equal(pagesFromPhysicalDescription('2 v. ; 24 cm'), undefined);
assert.equal(pagesFromPhysicalDescription('1 CD-ROM'), undefined);
// several volumes or a booklet with a disc: the number before "p." isn't the book's length
assert.equal(pagesFromPhysicalDescription('2 v. (345, 410 p.)'), undefined);
assert.equal(pagesFromPhysicalDescription('3 vols. (1200 p.)'), undefined);
assert.equal(pagesFromPhysicalDescription('2 volumes (xii, 900 p.) ; 24 cm'), undefined);
assert.equal(pagesFromPhysicalDescription('1 CD-ROM (120 p.)'), undefined);
assert.equal(pagesFromPhysicalDescription('2 audio discs (72 p. booklet)'), undefined);
assert.equal(pagesFromPhysicalDescription('1 DVD + 1 booklet (32 p.)'), undefined);
// one volume (how some catalogues write it) and an e-book are still books
assert.equal(pagesFromPhysicalDescription('1 v. (300 p.) ; 21 cm'), 300);
assert.equal(pagesFromPhysicalDescription('1 online resource (320 p.)'), 320);
assert.equal(pagesFromPhysicalDescription('xvi, 2 leaves, 410 p. ; 24 cm'), 410);
assert.equal(pagesFromPhysicalDescription(''), undefined);
assert.equal(pagesFromPhysicalDescription(undefined), undefined);
assert.equal(validPageCount(0), undefined);
assert.equal(validPageCount(NaN), undefined);
assert.equal(validPageCount(435), 435);
assert.equal(validPageCount(undefined), undefined);
console.log('pages: ok');
