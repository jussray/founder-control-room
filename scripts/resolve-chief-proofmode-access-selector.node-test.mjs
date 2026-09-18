import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChiefAccessSelector } from './resolve-chief-proofmode-access-selector.mjs';

const A = 'client-a.access';
const B = 'client-b.access';

test('Chief secret outranks matching generic aliases deterministically', () => {
  const result = resolveChiefAccessSelector({
    chiefClientIdSecret: A,
    genericClientIdSecret: A,
    genericClientIdVariable: A,
    requireIdentity: true,
  });
  assert.equal(result.clientId, A);
  assert.equal(result.clientIdSource, 'chief-specific');
  assert.match(result.selectorFingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('Chief variable outranks generic secret when values match', () => {
  const result = resolveChiefAccessSelector({
    chiefClientIdVariable: A,
    genericClientIdSecret: A,
    requireIdentity: true,
  });
  assert.equal(result.clientId, A);
  assert.equal(result.clientIdSource, 'chief-specific');
});

test('Chief secret and generic secret disagreement fails closed', () => {
  assert.throws(() => resolveChiefAccessSelector({
    chiefClientIdSecret: A,
    genericClientIdSecret: B,
    requireIdentity: true,
  }), /conflicts with the generic fallback alias/);
});

test('Chief variable and generic secret disagreement fails closed', () => {
  assert.throws(() => resolveChiefAccessSelector({
    chiefClientIdVariable: A,
    genericClientIdSecret: B,
    requireIdentity: true,
  }), /conflicts with the generic fallback alias/);
});

test('Chief secret and generic variable disagreement fails closed', () => {
  assert.throws(() => resolveChiefAccessSelector({
    chiefClientIdSecret: A,
    genericClientIdVariable: B,
    requireIdentity: true,
  }), /conflicts with the generic fallback alias/);
});

test('only generic alias remains an allowed backward-compatible fallback', () => {
  const result = resolveChiefAccessSelector({
    genericClientIdVariable: A,
    requireIdentity: true,
  });
  assert.equal(result.clientId, A);
  assert.equal(result.clientIdSource, 'generic-fallback');
});

test('matching specific and generic values resolve the exact same identity', () => {
  const first = resolveChiefAccessSelector({
    chiefClientIdVariable: A,
    genericClientIdSecret: A,
    requireIdentity: true,
  });
  const second = resolveChiefAccessSelector({
    chiefClientIdSecret: A,
    genericClientIdVariable: A,
    requireIdentity: true,
  });
  assert.equal(first.clientId, second.clientId);
  assert.equal(first.selectorFingerprint, second.selectorFingerprint);
});

test('no selector remains allowed for read-only discovery but not repair', () => {
  const check = resolveChiefAccessSelector({ requireIdentity: false });
  assert.equal(check.clientId, '');
  assert.equal(check.serviceTokenId, '');
  assert.equal(check.selectorFingerprint, null);
  assert.throws(
    () => resolveChiefAccessSelector({ requireIdentity: true }),
    /service-token identity is required before repair/,
  );
});

test('Chief service-token variable outranks matching generic token alias and conflicts fail closed', () => {
  const same = resolveChiefAccessSelector({
    chiefServiceTokenIdVariable: 'token-a',
    genericServiceTokenIdVariable: 'token-a',
    requireIdentity: true,
  });
  assert.equal(same.serviceTokenId, 'token-a');
  assert.equal(same.serviceTokenIdSource, 'chief-specific');

  assert.throws(() => resolveChiefAccessSelector({
    chiefServiceTokenIdVariable: 'token-a',
    genericServiceTokenIdVariable: 'token-b',
    requireIdentity: true,
  }), /service-token ID conflicts with the generic fallback alias/);
});
