import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256Hex } from '../src/sha256.mjs';

test('isolated SHA-256 helper matches standard vectors', () => {
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    sha256Hex('Founder Control Room 🔐'),
    '51ff2a579cb4c57dff0c495b43f77f096286fbcfa371dd1ee9e76348901ec872',
  );
});

test('isolated SHA-256 helper is deterministic and 256-bit hex', () => {
  const first = sha256Hex('same input');
  const second = sha256Hex('same input');
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, sha256Hex('different input'));
});
