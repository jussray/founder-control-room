import { test } from 'vitest';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { evaluateProtectionCoverage, coverageSigningBytes } from '../protectionCoverage.js';

const now = 1_800_000_000_000;
const keys = generateKeyPairSync('ed25519');
const target = { service: 'example-app', version: 'version-1', observer: 'independent-observer', publicKey: keys.publicKey };
const fresh = { service: target.service, version: target.version, observer: target.observer, observedAt: now, checks: { edge: true, public: true, private: true } };
const signed = (proof = fresh, key = keys.privateKey) => ({ ...proof, signature: sign(null, coverageSigningBytes(proof), key).toString('hex') });

test('accepts fresh independently signed coverage only', () => {
  assert.equal(evaluateProtectionCoverage(target, signed(), now), 'VERIFIED');
});
test('never accepts unsigned or tampered evidence', () => {
  assert.equal(evaluateProtectionCoverage(target, fresh, now), 'UNKNOWN');
  assert.equal(evaluateProtectionCoverage(target, { ...signed(), checks: { ...fresh.checks, edge: false } }, now), 'UNKNOWN');
});
test('rejects signatures from another key', () => {
  assert.equal(evaluateProtectionCoverage(target, signed(fresh, generateKeyPairSync('ed25519').privateKey), now), 'UNKNOWN');
});
test('rejects stale, future, wrong-version and wrong-service evidence', () => {
  for (const proof of [{ ...fresh, observedAt: now - 900001 }, { ...fresh, observedAt: now + 1 }, { ...fresh, version: 'old' }, { ...fresh, service: 'other' }]) {
    assert.equal(evaluateProtectionCoverage(target, signed(proof), now), 'UNKNOWN');
  }
});
test('a service cannot act as its own independent observer', () => {
  const proof = { ...fresh, observer: target.service };
  assert.equal(evaluateProtectionCoverage({ ...target, observer: target.service }, signed(proof), now), 'UNKNOWN');
});
test('a signed failing check is degraded, not verified', () => {
  assert.equal(evaluateProtectionCoverage(target, signed({ ...fresh, checks: { ...fresh.checks, edge: false } }), now), 'DEGRADED');
});
test('missing and malformed checks are not coverage', () => {
  assert.equal(evaluateProtectionCoverage(target, { ...signed(), checks: { edge: true } }, now), 'UNKNOWN');
  assert.equal(evaluateProtectionCoverage(target, { ...signed(), checks: { ...fresh.checks, extra: true } }, now), 'UNKNOWN');
});
test('rejects invalid trusted configuration and malformed input', () => {
  assert.equal(evaluateProtectionCoverage({ ...target, publicKey: keys.privateKey }, signed(), now), 'UNKNOWN');
  assert.equal(evaluateProtectionCoverage(target, null, now), 'UNKNOWN');
  assert.equal(evaluateProtectionCoverage(target, signed(), NaN), 'UNKNOWN');
});
