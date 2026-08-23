import { describe, expect, it } from 'vitest';
import { adaptSourceAuthorityRecordV0 } from '../sourceAuthorityV0Adapter.js';
import type { SourceAuthorityRecord } from '../sourceAuthority.js';

function canonicalRecord(overrides: Partial<SourceAuthorityRecord> = {}): SourceAuthorityRecord {
  const base: SourceAuthorityRecord = {
    surface: {
      product: 'Founder Control Room',
      surface: 'app',
      environment: 'production',
      provider: 'cloudflare',
      canonicalUrl: 'https://foundercontrolroom.org',
    },
    observedAt: '2026-08-23T22:45:00.000Z',
    source: {
      repository: 'jussray/founder-control-room',
      branch: 'main',
      sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      evidenceRef: 'github://main',
    },
    deployment: {
      providerProject: 'fcr',
      deploymentId: 'deploy-1',
      artifactSourceSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      evidenceRef: 'cloudflare://deploy-1',
    },
    runtime: {
      canonicalUrl: 'https://foundercontrolroom.org',
      releaseIdentity: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      evidenceRef: 'https://foundercontrolroom.org/version',
    },
    decision: 'canonical',
    reason: 'source, production artifact, and canonical runtime identities match',
  };

  return { ...base, ...overrides };
}

describe('adaptSourceAuthorityRecordV0', () => {
  it('maps a canonical main record into SourceAuthorityV0', () => {
    const result = adaptSourceAuthorityRecordV0(canonicalRecord());

    expect(result).toEqual({
      kind: 'source-authority.v0',
      repo: 'jussray/founder-control-room',
      branch: 'main',
      authoritativeSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      observedAt: '2026-08-23T22:45:00.000Z',
      source: 'github',
      correlationId: 'fcr-source-authority:jussray/founder-control-room:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('fails closed when the stored decision disagrees with canonical evidence', () => {
    expect(adaptSourceAuthorityRecordV0(canonicalRecord({ decision: 'unknown' }))).toBeNull();
  });

  it('fails closed for non-main source authority', () => {
    const record = canonicalRecord();
    record.source = { ...record.source, branch: 'feature/test' };
    expect(adaptSourceAuthorityRecordV0(record)).toBeNull();
  });

  it('fails closed when evidence evaluates to conflict', () => {
    const record = canonicalRecord();
    record.runtime = { ...record.runtime!, releaseIdentity: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
    expect(adaptSourceAuthorityRecordV0(record)).toBeNull();
  });
});
