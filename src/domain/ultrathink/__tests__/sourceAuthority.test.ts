import { describe, expect, it } from 'vitest';
import {
  evaluateSourceAuthority,
  type SourceAuthorityObservation,
} from '../sourceAuthority.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function observation(
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
    observedAt: '2026-08-23T04:30:00.000Z',
    source: {
      repository: 'jussray/founder-control-room',
      branch: 'main',
      sha: SHA,
      evidenceRef: 'github:main@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    deployment: {
      providerProject: 'founder-control-room',
      deploymentId: 'deployment-1',
      artifactId: 'artifact-1',
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

describe('ULTRATHINK source authority', () => {
  it('marks a surface canonical only when source, artifact, and runtime identities match', () => {
    expect(evaluateSourceAuthority(observation())).toEqual({
      decision: 'canonical',
      reason: 'source, production artifact, and canonical runtime identities match',
    });
  });

  it('detects source-to-artifact identity conflict', () => {
    const value = observation({
      deployment: {
        ...observation().deployment!,
        artifactSourceSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });

    expect(evaluateSourceAuthority(value).decision).toBe('conflict');
  });

  it('detects artifact-to-runtime identity conflict', () => {
    const value = observation({
      runtime: {
        ...observation().runtime!,
        releaseIdentity: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });

    expect(evaluateSourceAuthority(value).decision).toBe('conflict');
  });

  it('detects a runtime witness for the wrong canonical surface', () => {
    const value = observation({
      runtime: {
        ...observation().runtime!,
        canonicalUrl: 'https://preview.foundercontrolroom.org',
      },
    });

    expect(evaluateSourceAuthority(value)).toEqual({
      decision: 'conflict',
      reason: 'runtime witness is not attributable to the named canonical production surface',
    });
  });

  it('stays unknown when production deployment evidence is missing', () => {
    expect(evaluateSourceAuthority(observation({ deployment: undefined }))).toEqual({
      decision: 'unknown',
      reason: 'production deployment evidence is incomplete or unavailable',
    });
  });

  it('stays unknown when artifact source identity is missing', () => {
    const value = observation({
      deployment: {
        ...observation().deployment!,
        artifactSourceSha: undefined,
      },
    });

    expect(evaluateSourceAuthority(value).decision).toBe('unknown');
  });

  it('stays unknown when canonical runtime identity is missing', () => {
    const value = observation({
      runtime: {
        ...observation().runtime!,
        releaseIdentity: '',
      },
    });

    expect(evaluateSourceAuthority(value).decision).toBe('unknown');
  });

  it('stays unknown when an evidence reference is missing', () => {
    const value = observation({
      deployment: {
        ...observation().deployment!,
        evidenceRef: '',
      },
    });

    expect(evaluateSourceAuthority(value).decision).toBe('unknown');
  });
});
