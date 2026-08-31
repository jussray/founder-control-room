import { describe, expect, it } from 'vitest';
import type { ContinuityCookieV1, ContinuityObservationV1 } from '../operatorContinuity.js';
import {
  createContinuityFingerprint,
  evaluateContinuityCookie,
  mintContinuityCookie,
} from '../operatorContinuity.js';

const NOW = '2026-08-31T16:30:00.000Z';
const MINTED_AT = '2026-08-31T16:20:00.000Z';
const EXPIRES_AT = '2026-08-31T16:40:00.000Z';

function observation(overrides: Partial<ContinuityObservationV1> = {}): ContinuityObservationV1 {
  return {
    project: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    targetBranch: 'main',
    targetSha: 'a'.repeat(40),
    prNumber: 733,
    baseSha: 'b'.repeat(40),
    headSha: 'c'.repeat(40),
    scopeFingerprint: '1'.repeat(64),
    proofFingerprint: '2'.repeat(64),
    reviewFingerprint: '3'.repeat(64),
    providerFingerprint: '4'.repeat(64),
    runtimeFingerprint: '5'.repeat(64),
    authorityFingerprint: '6'.repeat(64),
    observedAt: MINTED_AT,
    ...overrides,
  };
}

function cookie(overrides: Parameters<typeof mintContinuityCookie>[0] extends infer T ? Partial<T> : never = {}) {
  return mintContinuityCookie({
    fingerprint: createContinuityFingerprint(observation()),
    mintedAt: MINTED_AT,
    expiresAt: EXPIRES_AT,
    issuer: 'fcr-truth-runtime',
    issuerIdentityState: 'verified',
    ...overrides,
  });
}

describe('operator continuity fingerprint', () => {
  it('uses a stable cross-repo canonical SHA-256 vector', () => {
    expect(createContinuityFingerprint(observation()).digest).toBe(
      '78f478e422bd731b0dbf45b1acd47c555bb4315ba7d6b618bf6219ee28afc02e',
    );
  });

  it('mints a descriptive cookie that grants no action authority', () => {
    const result = evaluateContinuityCookie(cookie(), createContinuityFingerprint(observation()), NOW);
    expect(result).toMatchObject({
      state: 'current',
      reasons: [],
      reacquireRequired: false,
      continuityMayAuthorizeAction: false,
    });
  });

  it('invalidates continuity whenever any load-bearing identity moves', () => {
    const variants: Array<[Partial<ContinuityObservationV1>, string]> = [
      [{ project: 'other-project' }, 'project_moved'],
      [{ repository: 'jussray/other' }, 'repository_moved'],
      [{ targetBranch: 'release' }, 'target_branch_moved'],
      [{ targetSha: 'd'.repeat(40) }, 'target_sha_moved'],
      [{ prNumber: 999 }, 'pr_moved'],
      [{ baseSha: 'd'.repeat(40) }, 'base_sha_moved'],
      [{ headSha: 'e'.repeat(40) }, 'head_sha_moved'],
      [{ scopeFingerprint: '7'.repeat(64) }, 'scope_moved'],
      [{ proofFingerprint: '8'.repeat(64) }, 'proof_moved'],
      [{ reviewFingerprint: '9'.repeat(64) }, 'review_moved'],
      [{ providerFingerprint: 'a'.repeat(64) }, 'provider_moved'],
      [{ runtimeFingerprint: 'b'.repeat(64) }, 'runtime_moved'],
      [{ authorityFingerprint: 'c'.repeat(64) }, 'authority_moved'],
    ];

    for (const [change, reason] of variants) {
      const result = evaluateContinuityCookie(
        cookie(),
        createContinuityFingerprint(observation(change)),
        NOW,
      );
      expect(result.state, reason).toBe('stale');
      expect(result.reacquireRequired, reason).toBe(true);
      expect(result.reasons, reason).toContain(reason);
      expect(result.continuityMayAuthorizeAction, reason).toBe(false);
    }
  });

  it('treats unknown-to-observed provider/runtime state as movement that requires reacquisition', () => {
    const prior = createContinuityFingerprint(observation({ providerFingerprint: null, runtimeFingerprint: null }));
    const continuityCookie = mintContinuityCookie({
      fingerprint: prior,
      mintedAt: MINTED_AT,
      expiresAt: EXPIRES_AT,
      issuer: 'fcr-truth-runtime',
      issuerIdentityState: 'verified',
    });
    const current = createContinuityFingerprint(observation());
    const result = evaluateContinuityCookie(continuityCookie, current, NOW);
    expect(result.state).toBe('stale');
    expect(result.reasons).toEqual(expect.arrayContaining(['provider_moved', 'runtime_moved']));
  });

  it('expires continuity without converting expiration into authority', () => {
    const result = evaluateContinuityCookie(
      cookie(),
      createContinuityFingerprint(observation()),
      '2026-08-31T16:40:00.001Z',
    );
    expect(result.state).toBe('stale');
    expect(result.reasons).toContain('cookie_expired');
    expect(result.continuityMayAuthorizeAction).toBe(false);
  });

  it('fails closed on an unverified issuer', () => {
    const continuityCookie = cookie({ issuerIdentityState: 'unverified' });
    const result = evaluateContinuityCookie(continuityCookie, createContinuityFingerprint(observation()), NOW);
    expect(result.state).toBe('invalid');
    expect(result.reasons).toContain('cookie_issuer_unverified');
  });

  it('detects cookie or embedded-fingerprint tampering', () => {
    const original = cookie();
    const tamperedFingerprint = {
      ...original.fingerprint,
      observation: { ...original.fingerprint.observation, headSha: 'd'.repeat(40) },
    };
    const tampered = { ...original, fingerprint: tamperedFingerprint } as ContinuityCookieV1;
    const result = evaluateContinuityCookie(tampered, createContinuityFingerprint(observation()), NOW);
    expect(result.state).toBe('invalid');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'fingerprint_integrity_mismatch',
      'cookie_integrity_mismatch',
    ]));
  });

  it('rejects attempts to turn a continuity cookie into an authority grant', () => {
    const forged = { ...cookie(), authority: true } as unknown as ContinuityCookieV1;
    const result = evaluateContinuityCookie(forged, createContinuityFingerprint(observation()), NOW);
    expect(result.state).toBe('invalid');
    expect(result.reasons).toContain('cookie_authority_invalid');
    expect(result.continuityMayAuthorizeAction).toBe(false);
  });
});
