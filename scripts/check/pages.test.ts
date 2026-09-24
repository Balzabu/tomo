import assert from 'node:assert/strict';
import { pagesFromPhysicalDescription, validPageCount } from '../../src/lib/pages.ts';

assert.equal(pagesFromPhysicalDescription('445 p. ; 20 cm'), 445);
assert.equal(pagesFromPhysicalDescription('XII, 380 p. : ill. ; 24 cm'), 380);
assert.equal(pagesFromPhysicalDescription('445, [3] p. ; 21 cm'), 445);
assert.equal(pagesFromPhysicalDescription('[4], 212 p.'), 212);
assert.equal(pagesFromPhysicalDescription('2 v. ; 24 cm'), undefined);
assert.equal(pagesFromPhysicalDescription('1 CD-ROM'), undefined);
assert.equal(pagesFromPhysicalDescription(''), undefined);
assert.equal(pagesFromPhysicalDescription(undefined), undefined);
assert.equal(validPageCount(0), undefined);
assert.equal(validPageCount(NaN), undefined);
assert.equal(validPageCount(435), 435);
assert.equal(validPageCount(undefined), undefined);
console.log('pages: ok');
