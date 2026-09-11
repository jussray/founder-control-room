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

const link: ClaimEvidenceLink = {
  claimId: 'provider-claim',
  evidenceId: 'provider-evidence',
  compatibleScope: 'provider_execution',
};

function render(evidence: ClaimEvidenceRecord): boolean {
  return canRenderVerifiedClaim(providerClaim(), {
    now: NOW,
    evidenceLinks: [link],
    evidenceById: new Map([[evidence.id, evidence]]),
  });
}

describe('live-provider truth freshness', () => {
  it('accepts provider evidence only while its own observation lease is fresh', () => {
    expect(render(providerEvidence())).toBe(true);
  });

  it('rejects provider evidence without an explicit freshness lease', () => {
    expect(render(providerEvidence({ freshnessExpiresAt: null }))).toBe(false);
  });

  it('rejects expired, invalid, or future-dated provider observations', () => {
    expect(render(providerEvidence({ freshnessExpiresAt: '2026-09-11T01:29:59.000Z' }))).toBe(false);
    expect(render(providerEvidence({ observedAt: 'invalid' }))).toBe(false);
    expect(render(providerEvidence({ observedAt: '2026-09-11T01:31:00.000Z' }))).toBe(false);
  });
});
