import { describe, expect, it } from 'vitest';

import {
  claimInvariantUnits,
  normalizedClaimFingerprint,
  normalizedClaimUnits,
} from './documentationTruthClaimFingerprint.js';

describe('documentation truth claim fingerprints', () => {
  it('normalizes cosmetic casing, whitespace, and punctuation', () => {
    expect(normalizedClaimFingerprint('State MUST remain current.'))
      .toBe(normalizedClaimFingerprint('  state must remain CURRENT!!!  '));
  });

  it('ignores Markdown code-span delimiters around the same invariant', () => {
    expect(normalizedClaimFingerprint('`state !== CURRENT` must hold'))
      .toBe(normalizedClaimFingerprint('state !== CURRENT must hold'));
  });

  it('distinguishes strict inequality from strict equality', () => {
    expect(normalizedClaimFingerprint('state !== CURRENT must hold'))
      .not.toBe(normalizedClaimFingerprint('state === CURRENT must hold'));
  });

  it('distinguishes inclusive ordering operators', () => {
    expect(normalizedClaimFingerprint('count <= limit must hold'))
      .not.toBe(normalizedClaimFingerprint('count >= limit must hold'));
  });

  it('distinguishes strict ordering operators', () => {
    expect(normalizedClaimFingerprint('count < limit must hold'))
      .not.toBe(normalizedClaimFingerprint('count > limit must hold'));
  });

  it('treats standalone angle-bracket prefixes as cosmetic punctuation', () => {
    expect(normalizedClaimFingerprint('Claim must hold'))
      .toBe(normalizedClaimFingerprint('> Claim must hold'));
    expect(normalizedClaimFingerprint('Claim must hold'))
      .toBe(normalizedClaimFingerprint('< Claim must hold'));
  });

  it('ignores HTML formatting wrappers around the same invariant', () => {
    expect(normalizedClaimFingerprint('State must remain current'))
      .toBe(normalizedClaimFingerprint('<code>State must remain current</code>'));
  });

  it('ignores Markdown link destinations while retaining visible labels', () => {
    expect(normalizedClaimFingerprint('`scripts/verify-documentation-truth.mjs` must remain current'))
      .toBe(normalizedClaimFingerprint('[`scripts/verify-documentation-truth.mjs`](https://docs.example/verifier) must remain current'));
    expect(normalizedClaimFingerprint('Claim must remain current'))
      .toBe(normalizedClaimFingerprint('[Claim](https://docs.example/path_(nested)) must remain current'));
  });

  it('ignores HTML comments rather than treating them as claim novelty', () => {
    expect(normalizedClaimFingerprint('State must remain current'))
      .toBe(normalizedClaimFingerprint('State must remain current <!-- cosmetic note -->'));
  });

  it('preserves ordering operators next to quoted and signed literals', () => {
    expect(normalizedClaimFingerprint('value < "limit" must hold'))
      .not.toBe(normalizedClaimFingerprint('value > "limit" must hold'));
    expect(normalizedClaimFingerprint('count < -1 must hold'))
      .not.toBe(normalizedClaimFingerprint('count > -1 must hold'));
  });

  it('distinguishes logical operators', () => {
    expect(normalizedClaimFingerprint('ready && approved must hold'))
      .not.toBe(normalizedClaimFingerprint('ready || approved must hold'));
  });

  it('distinguishes equality operators', () => {
    expect(normalizedClaimFingerprint('state == CURRENT must hold'))
      .not.toBe(normalizedClaimFingerprint('state != CURRENT must hold'));
  });

  it('treats sentence exclamation separators as cosmetic punctuation', () => {
    expect(normalizedClaimFingerprint('Claims. Never widen authority.'))
      .toBe(normalizedClaimFingerprint('Claims! Never widen authority.'));
  });

  it('distinguishes unary negation from the same unnegated invariant', () => {
    expect(normalizedClaimFingerprint('!ready must hold'))
      .not.toBe(normalizedClaimFingerprint('ready must hold'));
  });

  it('normalizes whitespace after unary negation inside code spans', () => {
    expect(normalizedClaimFingerprint('`!ready` must hold'))
      .toBe(normalizedClaimFingerprint('`! ready` must hold'));
    expect(normalizedClaimFingerprint('`! ready` must hold'))
      .not.toBe(normalizedClaimFingerprint('`ready` must hold'));
  });

  it('normalizes invariant units independently of claim splitting or merging', () => {
    const merged = normalizedClaimUnits('`path/a.ts` must remain current. `path/b.ts` must fail closed.');
    const split = [
      ...normalizedClaimUnits('`path/a.ts` must remain current.'),
      ...normalizedClaimUnits('`path/b.ts` must fail closed.'),
    ];
    expect(merged).toEqual(split);
    expect(claimInvariantUnits('`! ready` must hold. Next invariant must remain current.')).toHaveLength(2);
  });
});
