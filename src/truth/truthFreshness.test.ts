import { describe, expect, it } from 'vitest';
import {
  canRenderVerifiedClaim,
  type ClaimEvidenceLink,
  type ClaimEvidenceRecord,
  type TruthClaim,
} from './truth.js';

const NOW = '2026-09-11T01:30:00.000Z';

function providerClaim(): TruthClaim {
  return {
    id: 'provider-claim',
    subjectType: 'provider',
    subjectId: 'cloudflare',
    assertion: 'provider state is current',
    status: 'verified',
    source: 'live_provider',
    evidenceScope: ['provider_execution'],
    targetFingerprint: null,
    freshnessExpiresAt: '2026-09-11T02:00:00.000Z',
    evidenceIds: ['provider-evidence'],
    doesNotProve: ['future provider state'],
    conflictIds: [],
    provenanceId: 'provider-proof-1',
  };
}

function providerEvidence(overrides: Partial<ClaimEvidenceRecord> = {}): ClaimEvidenceRecord {
  return {
    id: 'provider-evidence',
    source: 'live_provider',
    scope: 'provider_execution',
    observedAt: '2026-09-11T01:20:00.000Z',
    freshnessExpiresAt: '2026-09-11T01:40:00.000Z',
    targetFingerprint: null,
    integrityDigest: null,
    provenanceId: 'provider-proof-1',
    ...overrides,
  };
}

const providerLink: ClaimEvidenceLink = {
  claimId: 'provider-claim',
  evidenceId: 'provider-evidence',
  compatibleScope: 'provider_execution',
};

function renderProvider(evidence: ClaimEvidenceRecord): boolean {
  return canRenderVerifiedClaim(providerClaim(), {
    now: NOW,
    evidenceLinks: [providerLink],
    evidenceById: new Map([[evidence.id, evidence]]),
  });
}

function exactTargetClaim(): TruthClaim {
  return {
    id: 'target-claim',
    subjectType: 'repository',
    subjectId: 'fcr',
    assertion: 'exact repository target is current',
    status: 'verified',
    source: 'exact_target_verification',
    evidenceScope: ['repository_state'],
    targetFingerprint: 'sha:abc',
    freshnessExpiresAt: '2026-09-11T02:00:00.000Z',
    evidenceIds: ['target-evidence'],
    doesNotProve: ['future repository state'],
    conflictIds: [],
    provenanceId: 'target-proof-1',
  };
}

function exactTargetEvidence(observedAt: string): ClaimEvidenceRecord {
  return {
    id: 'target-evidence',
    source: 'exact_target_verification',
    scope: 'repository_state',
    observedAt,
    freshnessExpiresAt: '2026-09-11T01:45:00.000Z',
    targetFingerprint: 'sha:abc',
    integrityDigest: null,
    provenanceId: 'target-proof-1',
  };
}

const targetLink: ClaimEvidenceLink = {
  claimId: 'target-claim',
  evidenceId: 'target-evidence',
  compatibleScope: 'repository_state',
};

describe('truth evidence freshness', () => {
  it('accepts provider evidence only while its own observation lease is fresh', () => {
    expect(renderProvider(providerEvidence())).toBe(true);
  });

  it('rejects provider evidence without an explicit freshness lease', () => {
    expect(renderProvider(providerEvidence({ freshnessExpiresAt: null }))).toBe(false);
  });

  it('rejects expired, invalid, or future-dated provider observations', () => {
    expect(renderProvider(providerEvidence({ freshnessExpiresAt: '2026-09-11T01:29:59.000Z' }))).toBe(false);
    expect(renderProvider(providerEvidence({ observedAt: 'invalid' }))).toBe(false);
    expect(renderProvider(providerEvidence({ observedAt: '2026-09-11T01:31:00.000Z' }))).toBe(false);
  });

  it('rejects invalid or future-dated non-provider evidence too', () => {
    const claim = exactTargetClaim();
    const render = (observedAt: string) => canRenderVerifiedClaim(claim, {
      now: NOW,
      currentTargetFingerprint: 'sha:abc',
      evidenceLinks: [targetLink],
      evidenceById: new Map([['target-evidence', exactTargetEvidence(observedAt)]]),
    });

    expect(render('2026-09-11T01:20:00.000Z')).toBe(true);
    expect(render('invalid')).toBe(false);
    expect(render('2026-09-11T01:31:00.000Z')).toBe(false);
  });
});
