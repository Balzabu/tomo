import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, hashPin, verifyPin, isValidPin, lockoutMs, newSalt } from '../../src/lib/lockCore.ts';

for (const s of ['', 'abc', 'Tomo è bello 📚', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(200)]) {
  assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), `sha256(${s.slice(0, 10)}…)`);
}
const salt = newSalt();
assert.equal(salt.length, 32);
const h = hashPin('1234', salt);
assert.ok(verifyPin('1234', salt, h)); assert.ok(!verifyPin('1235', salt, h)); assert.ok(!verifyPin('1234', newSalt(), h));
assert.notEqual(hashPin('1234', 'a'), hashPin('1234', 'b'));
assert.ok(isValidPin('1234') && isValidPin('123456')); assert.ok(!isValidPin('123') && !isValidPin('1234567') && !isValidPin('12a4'));
assert.equal(lockoutMs(4), 0); assert.equal(lockoutMs(5), 30_000); assert.equal(lockoutMs(6), 60_000); assert.equal(lockoutMs(20), 15 * 60_000);
console.log('lock: all assertions passed');
