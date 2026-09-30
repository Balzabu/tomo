import assert from 'node:assert/strict';
import { decodeEntities, plainText } from '../../src/lib/plainText.ts';

// The Google Books description seen on the device.
assert.equal(plainText('the abbey&#39;s labyrinthine secrets'), "the abbey's labyrinthine secrets");
assert.equal(decodeEntities('caff&egrave; &amp; &laquo;libri&raquo; &#x2019; &hellip;'), 'caffè & «libri» ’ …');
assert.equal(decodeEntities('&Agrave; &ntilde; &ccedil;'), 'À ñ ç');
// unknown entities and bare ampersands stay as written
assert.equal(decodeEntities('AT&T &foo; &#0;'), 'AT&T &foo; &#0;');
// tags go, paragraphs and line breaks stay
assert.equal(plainText('<p>One <b>two</b>.</p><p>Three<br/>four</p>'), 'One two.\n\nThree\nfour');
assert.equal(plainText('<p>   </p>'), undefined);
assert.equal(plainText(undefined), undefined);
// a literal "<" in text that isn't a tag survives once decoded
assert.equal(plainText('a &lt; b'), 'a < b');

console.log('plainText: all assertions passed');
