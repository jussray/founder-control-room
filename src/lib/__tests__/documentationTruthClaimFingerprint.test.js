import { describe, expect, it } from 'vitest';

import {
  claimInvariantUnits,
  hasFreshMeaningfulInvariant,
  normalizedClaimFingerprint,
  normalizedClaimUnits,
} from '../../../scripts/documentation-truth-claim-fingerprint.mjs';

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

  it('treats sentence-boundary punctuation changes as the same unit sequence', () => {
    expect(normalizedClaimUnits('`path/a.ts` must remain current. `path/b.ts` must fail closed.'))
      .toEqual(normalizedClaimUnits('`path/a.ts` must remain current, `path/b.ts` must fail closed.'));
    expect(normalizedClaimUnits('`path/a.ts` must remain current; `path/b.ts` must fail closed.'))
      .toEqual(normalizedClaimUnits('`path/a.ts` must remain current: `path/b.ts` must fail closed.'));
  });
});

describe('documentation truth claim freshness against the reviewed base', () => {
  const sourcePath = 'scripts/example-gate.mjs';
  // Mirrors the verifier's meaningfulInvariant: path-bound, modal, and long enough.
  const meaningful = (unit) => unit.length >= 48
    && unit.includes(sourcePath)
    && /\b(must|cannot|requires?|rejects?|never|only)\b/i.test(unit);
  const inheritedA = '`scripts/example-gate.mjs` must reject unsigned receipts before any merge evaluation.';
  const inheritedB = '`scripts/example-gate.mjs` must never widen merge authority from a green check.';

  it('accepts the append-only practice: inherited claims retained plus one fresh claim', () => {
    const fresh = '`scripts/example-gate.mjs` must bind every receipt to the exact reviewed head SHA.';
    expect(hasFreshMeaningfulInvariant([inheritedA, inheritedB, fresh], [inheritedA, inheritedB], meaningful)).toBe(true);
  });

  it('accepts a rewritten inherited claim that adds a new meaningful invariant unit', () => {
    const rewritten = '`scripts/example-gate.mjs` must reject unsigned or expired receipts before any merge evaluation.';
    expect(hasFreshMeaningfulInvariant([rewritten, inheritedB], [inheritedA, inheritedB], meaningful)).toBe(true);
  });

  it('accepts every claim as fresh when the base receipt had none for the path', () => {
    expect(hasFreshMeaningfulInvariant([inheritedA], [], meaningful)).toBe(true);
  });

  it('rejects claims copied unchanged from the base receipt', () => {
    expect(hasFreshMeaningfulInvariant([inheritedA, inheritedB], [inheritedA, inheritedB], meaningful)).toBe(false);
  });

  it('rejects cosmetic re-formatting of an inherited claim', () => {
    const cosmetic = '[`scripts/example-gate.mjs`](https://docs.example/gate) MUST reject unsigned receipts before any merge evaluation!';
    expect(hasFreshMeaningfulInvariant([cosmetic], [inheritedA], meaningful)).toBe(false);
  });

  it('rejects recombining inherited invariant units into one claim', () => {
    const merged = `${inheritedA} ${inheritedB}`;
    expect(hasFreshMeaningfulInvariant([merged], [inheritedA, inheritedB], meaningful)).toBe(false);
  });

  it('rejects a fresh claim that is not a meaningful path-bound invariant', () => {
    const vague = 'Updated the gate wording for clarity in this change.';
    expect(hasFreshMeaningfulInvariant([inheritedA, vague], [inheritedA], meaningful)).toBe(false);
  });
});
