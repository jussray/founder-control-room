import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_REASONING_CONTRACT,
  reasonAboutCloudflare,
} from '../reason.js';
import type { CloudflareSignal } from '../types.js';

const NOW = '2026-07-13T12:00:00.000Z';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function signal(
  partial: Partial<CloudflareSignal> & Pick<CloudflareSignal, 'id' | 'kind' | 'status'>,
): CloudflareSignal {
  return {
    source: 'test',
    observedAt: '2026-07-13T11:55:00.000Z',
    ...partial,
  };
}

function verifiedSignals(): CloudflareSignal[] {
  return [
    signal({
      id: 'worker',
      kind: 'worker_deployment',
      status: 'success',
      commitSha: SHA,
      authority: 'native_git',
    }),
    signal({
      id: 'pages',
      kind: 'pages_deployment',
      status: 'success',
      commitSha: SHA,
      authority: 'native_git',
    }),
    signal({
      id: 'health',
      kind: 'runtime_health',
      status: 'success',
      url: 'https://example.com/health',
    }),
    signal({
      id: 'route',
      kind: 'route',
      status: 'success',
    }),
  ];
}

describe('Cloudflare reasoning contract', () => {
  it('is read-only and keeps every material action separately gated', () => {
    expect(CLOUDFLARE_REASONING_CONTRACT.mode).toBe('read_only_reasoning');
    expect(CLOUDFLARE_REASONING_CONTRACT.command).toBe(':cloudflare reason <project>');
    expect(CLOUDFLARE_REASONING_CONTRACT.approvalCarryForward).toBe(false);
    expect(CLOUDFLARE_REASONING_CONTRACT.approvalGates).toEqual([
      'create_branch',
      'merge',
      'deploy',
      'rollback',
      'secrets-change',
      'dns-change',
    ]);
  });
});

describe('reasonAboutCloudflare', () => {
  it('verifies only when Worker, Pages, and runtime agree on fresh evidence', () => {
    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: {
        commitSha: SHA,
        workerName: 'api-worker',
        pagesProject: 'frontend',
        deploymentAuthority: 'native_git',
      },
      signals: verifiedSignals(),
      now: NOW,
    });

    expect(report.outcome).toBe('verified');
    expect(report.confidence).toBe('high');
    expect(report.missingEvidence).toEqual([]);
    expect(report.ooda.act.some((item) => item.id === 'record-verified-cloudflare-release')).toBe(true);
    expect(report.sensitiveFieldsIncluded).toBe(false);
    expect(report.approvalCarryForward).toBe(false);
  });

  it('blocks a desired-versus-deployed commit mismatch and prepares rollback without executing it', () => {
    const signals = verifiedSignals().map((item) => item.id === 'worker'
      ? { ...item, commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
      : item);

    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: { commitSha: SHA, deploymentAuthority: 'native_git' },
      signals,
      now: NOW,
    });

    expect(report.outcome).toBe('blocked');
    expect(report.l99.drift).toContain('Commit drift');
    expect(report.ooda.act).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'record-release-drift', safeToAutoRun: true }),
      expect.objectContaining({
        id: 'prepare-cloudflare-rollback',
        requiresFounderApproval: true,
        approvalGate: 'rollback',
      }),
    ]));
  });

  it('treats an invalid token beside successful native Git deployment as duplicate authority, not automatic credential rotation', () => {
    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: { commitSha: SHA, deploymentAuthority: 'native_git' },
      signals: [
        ...verifiedSignals(),
        signal({
          id: 'credential-failure',
          kind: 'credential',
          status: 'failure',
          detailCode: '9109',
          authority: 'token_upload',
        }),
      ],
      now: NOW,
    });

    expect(report.outcome).toBe('blocked');
    expect(report.l99.authority).toContain('Conflicting authorities');
    expect(report.ooda.act).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'prepare-single-authority-patch',
        approvalGate: 'create_branch',
      }),
    ]));
    expect(report.ooda.act.some((item) => item.id === 'repair-cloudflare-credential')).toBe(false);
  });

  it('enters degraded mode when evidence is stale instead of recycling an old conclusion', () => {
    const stale = verifiedSignals().map((item) => ({
      ...item,
      observedAt: '2026-07-13T09:00:00.000Z',
    }));

    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: { commitSha: SHA },
      signals: stale,
      now: NOW,
      maxEvidenceAgeMinutes: 20,
    });

    expect(report.outcome).toBe('degraded');
    expect(report.confidence).toBe('low');
    expect(report.freshSignalIds).toEqual([]);
    expect(report.staleSignalIds).toHaveLength(stale.length);
    expect(report.missingEvidence).toEqual([
      'worker_deployment',
      'pages_deployment_or_release_marker',
      'runtime_health',
    ]);
  });

  it('orients toward runtime bindings when deployment succeeded but health failed', () => {
    const signals = verifiedSignals().map((item) => item.id === 'health'
      ? { ...item, status: 'failure' as const, detailCode: 'WORKER_STARTUP_ERROR' }
      : item);

    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: { commitSha: SHA, deploymentAuthority: 'native_git' },
      signals,
      now: NOW,
    });

    expect(report.outcome).toBe('blocked');
    expect(report.ooda.act).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'inspect-runtime-bindings',
        safeToAutoRun: true,
        requiresFounderApproval: false,
      }),
    ]));
    expect(report.redteamPremise).toContain(
      'A successful build does not prove DNS, routes, bindings, secrets, or runtime health are correct.',
    );
  });

  it('never marks deploy, rollback, DNS, or secret changes as automatic', () => {
    const report = reasonAboutCloudflare({
      projectId: 'project-1',
      desired: { commitSha: SHA, deploymentAuthority: 'token_upload' },
      signals: [
        signal({
          id: 'token-failure',
          kind: 'credential',
          status: 'failure',
          detailCode: '10000',
          authority: 'token_upload',
        }),
      ],
      now: NOW,
    });

    const material = report.ooda.act.filter((item) => item.approvalGate);
    expect(material.length).toBeGreaterThan(0);
    expect(material.every((item) => item.requiresFounderApproval && !item.safeToAutoRun)).toBe(true);
  });
});
