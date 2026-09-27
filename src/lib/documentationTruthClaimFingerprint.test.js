import { describe, expect, it } from 'vitest';

import { normalizedClaimFingerprint } from './documentationTruthClaimFingerprint.js';

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
});
