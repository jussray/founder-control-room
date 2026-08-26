import { describe, expect, it } from 'vitest';
import {
  evaluateProductionTruthLease,
  type ProductionTruthLeaseObservation,
} from '../productionTruthLease.js';
import {
  evaluateSourceAuthority,
  type SourceAuthorityObservation,
  type SourceAuthorityRecord,
} from '../sourceAuthority.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EVIDENCE_HASH = `sha256:${'1'.repeat(64)}` as const;
const WITNESS_OBSERVED_AT = '2026-08-23T05:14:00.000Z';

function witnessEvidence(evidenceRef: string) {
  return {
    evidenceRef,
    evidenceHash: EVIDENCE_HASH,
    observedAt: WITNESS_OBSERVED_AT,
  } as const;
}

function sourceAuthorityObservation(
  overrides: Partial<SourceAuthorityObservation> = {},
): SourceAuthorityObservation {
  return {
    surface: {
      product: 'founder-control-room',
      surface: 'governance-control-plane',
      environment: 'production',
      canonicalUrl: 'https://foundercontrolroom.org',
      provider: 'cloudflare',
    },
    observedAt: '2026-08-23T05:10:00.000Z',
    source: {
      repository: 'jussray/founder-control-room',
      branch: 'main',
      sha: SHA,
      evidenceRef: 'github:main@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    deployment: {
      providerProject: 'founder-control-room',
      deploymentId: 'deployment-1',
      artifactSourceSha: SHA,
      evidenceRef: 'cloudflare:deployment-1',
    },
    runtime: {
      canonicalUrl: 'https://foundercontrolroom.org',
      releaseIdentity: SHA,
      evidenceRef: 'runtime:release-marker-1',
    },
    ...overrides,
  };
}

function authorityRecord(
  overrides: Partial<SourceAuthorityObservation> = {},
): SourceAuthorityRecord {
  const observation = sourceAuthorityObservation(overrides);
  return {
    ...observation,
    ...evaluateSourceAuthority(observation),
  };
}

function lease(
  overrides: Partial<ProductionTruthLeaseObservation> = {},
): ProductionTruthLeaseObservation {
  return {
    surface: {
      product: 'founder-control-room',
      surface: 'governance-control-plane',
      environment: 'production',
      canonicalUrl: 'https://foundercontrolroom.org',
      provider: 'cloudflare',
    },
    observedAt: '2026-08-23T05:15:00.000Z',
    sourceAuthority: authorityRecord(),
    runtime: {
      result: 'pass',
      ...witnessEvidence('runtime:health-1'),
    },
    dataAuth: {
      provider: 'supabase',
      projectRef: 'oojzfmmywbvficgybaxd',
      result: 'pass',
      ...witnessEvidence('supabase:posture-1'),
    },
    experience: {
      scenario: 'governance-critical journey',
      result: 'pass',
      ...witnessEvidence('playwright:report-1'),
    },
    ...overrides,
  };
}

describe('ULTRATHINK production truth lease', () => {
  it('passes only with canonical source authority and passing production witnesses', () => {
    expect(evaluateProductionTruthLease(lease())).toEqual({
      result: 'pass',
      reason: 'canonical source authority and all production witnesses pass',
    });
  });

  it('fails when source authority evidence conflicts', () => {
    const sourceAuthority = authorityRecord({
      runtime: {
        canonicalUrl: 'https://foundercontrolroom.org',
        releaseIdentity: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        evidenceRef: 'runtime:release-marker-2',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority })).result).toBe('fail');
  });

  it('fails when source SHA differs from the production artifact source SHA', () => {
    const sourceAuthority = authorityRecord({
      deployment: {
        providerProject: 'founder-control-room',
        deploymentId: 'deployment-mismatch-source-artifact',
        artifactSourceSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        evidenceRef: 'cloudflare:deployment-mismatch-source-artifact',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority })).result).toBe('fail');
  });

  it('fails when the production artifact source SHA differs from the runtime release identity', () => {
    const sourceAuthority = authorityRecord({
      deployment: {
        providerProject: 'founder-control-room',
        deploymentId: 'deployment-mismatch-artifact-runtime',
        artifactSourceSha: SHA,
        evidenceRef: 'cloudflare:deployment-mismatch-artifact-runtime',
      },
      runtime: {
        canonicalUrl: 'https://foundercontrolroom.org',
        releaseIdentity: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        evidenceRef: 'runtime:mismatch-artifact-runtime',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority })).result).toBe('fail');
  });

  it('blocks when production artifact source SHA is missing', () => {
    const sourceAuthority = authorityRecord({
      deployment: {
        providerProject: 'founder-control-room',
        deploymentId: 'deployment-missing-artifact-source',
        artifactSourceSha: '',
        evidenceRef: 'cloudflare:deployment-missing-artifact-source',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority }))).toEqual({
      result: 'blocked',
      reason: 'source authority is not canonical',
    });
  });

  it('blocks when canonical runtime release identity is missing', () => {
    const sourceAuthority = authorityRecord({
      runtime: {
        canonicalUrl: 'https://foundercontrolroom.org',
        releaseIdentity: '',
        evidenceRef: 'runtime:missing-release-identity',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority }))).toEqual({
      result: 'blocked',
      reason: 'source authority is not canonical',
    });
  });

  it('blocks when source authority is unknown', () => {
    const sourceAuthority = authorityRecord({ deployment: undefined });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority }))).toEqual({
      result: 'blocked',
      reason: 'source authority is not canonical',
    });
  });

  it('fails when a stored authority decision disagrees with its evidence', () => {
    const sourceAuthority = {
      ...authorityRecord(),
      decision: 'unknown' as const,
      reason: 'stale stored decision',
    };

    expect(evaluateProductionTruthLease(lease({ sourceAuthority }))).toEqual({
      result: 'fail',
      reason: 'source authority record decision is inconsistent with its evidence',
    });
  });

  it('fails when the authority record belongs to another production surface', () => {
    const sourceAuthority = authorityRecord({
      surface: {
        product: 'founder-control-room',
        surface: 'api',
        environment: 'production',
        canonicalUrl: 'https://api.foundercontrolroom.org',
        provider: 'cloudflare',
      },
      runtime: {
        canonicalUrl: 'https://api.foundercontrolroom.org',
        releaseIdentity: SHA,
        evidenceRef: 'runtime:api-release-1',
      },
    });

    expect(evaluateProductionTruthLease(lease({ sourceAuthority }))).toEqual({
      result: 'fail',
      reason: 'source authority record belongs to a different production surface',
    });
  });

  it('fails when runtime health fails', () => {
    expect(evaluateProductionTruthLease(lease({
      runtime: {
        result: 'fail',
        ...witnessEvidence('runtime:health-1'),
      },
    })).result).toBe('fail');
  });

  it('fails when data/auth posture fails', () => {
    expect(evaluateProductionTruthLease(lease({
      dataAuth: {
        provider: 'supabase',
        projectRef: 'oojzfmmywbvficgybaxd',
        result: 'fail',
        ...witnessEvidence('supabase:posture-1'),
      },
    })).result).toBe('fail');
  });

  it('fails when the critical experience fails', () => {
    expect(evaluateProductionTruthLease(lease({
      experience: {
        scenario: 'governance-critical journey',
        result: 'fail',
        ...witnessEvidence('playwright:report-1'),
      },
    })).result).toBe('fail');
  });

  it('blocks when any required witness is blocked', () => {
    expect(evaluateProductionTruthLease(lease({
      experience: {
        scenario: 'governance-critical journey',
        result: 'blocked',
        ...witnessEvidence('playwright:report-1'),
      },
    })).result).toBe('blocked');
  });

  it('blocks when a required evidence reference is missing', () => {
    expect(evaluateProductionTruthLease(lease({
      runtime: {
        result: 'pass',
        ...witnessEvidence(''),
      },
    }))).toEqual({
      result: 'blocked',
      reason: 'required production witness evidence is missing or invalid',
    });
  });

  it('blocks when a witness evidence hash is malformed', () => {
    expect(evaluateProductionTruthLease(lease({
      runtime: {
        result: 'pass',
        evidenceRef: 'runtime:health-1',
        evidenceHash: 'sha256:not-a-real-digest',
        observedAt: WITNESS_OBSERVED_AT,
      },
    }))).toEqual({
      result: 'blocked',
      reason: 'required production witness evidence is missing or invalid',
    });
  });

  it('blocks when a witness observation timestamp is invalid', () => {
    expect(evaluateProductionTruthLease(lease({
      experience: {
        scenario: 'governance-critical journey',
        result: 'pass',
        evidenceRef: 'playwright:report-1',
        evidenceHash: EVIDENCE_HASH,
        observedAt: 'not-a-time',
      },
    }))).toEqual({
      result: 'blocked',
      reason: 'required production witness evidence is missing or invalid',
    });
  });
});
