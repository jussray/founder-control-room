import { describe, expect, it } from 'vitest';

import { normalizedClaimFingerprint } from './documentationTruthClaimFingerprint.js';

describe('documentation truth claim fingerprints', () => {
  it('normalizes cosmetic casing, whitespace, and punctuation', () => {
    expect(normalizedClaimFingerprint('State MUST remain current.'))
      .toBe(normalizedClaimFingerprint('  state must remain CURRENT!!!  '));
  });

  it('distinguishes strict inequality from strict equality in code spans', () => {
    expect(normalizedClaimFingerprint('`state !== CURRENT` must hold'))
      .not.toBe(normalizedClaimFingerprint('`state === CURRENT` must hold'));
  });

  it('distinguishes ordered comparison operators in code spans', () => {
    expect(normalizedClaimFingerprint('`count <= limit` must hold'))
      .not.toBe(normalizedClaimFingerprint('`count >= limit` must hold'));
  });

  it('distinguishes logical operators in code spans', () => {
    expect(normalizedClaimFingerprint('`ready && approved` must hold'))
      .not.toBe(normalizedClaimFingerprint('`ready || approved` must hold'));
  });

  it('distinguishes equality operators in code spans', () => {
    expect(normalizedClaimFingerprint('`state == CURRENT` must hold'))
      .not.toBe(normalizedClaimFingerprint('`state != CURRENT` must hold'));
  });
});
