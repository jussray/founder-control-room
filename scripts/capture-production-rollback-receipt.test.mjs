import { describe, expect, it } from 'vitest';

import {
  buildRollbackReceipt,
  selectActiveWorkerDeployment,
  selectPagesRollbackDeployment,
} from './capture-production-rollback-receipt.mjs';

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);

function workerPayload(overrides = {}) {
  return {
    deployments: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        created_on: '2026-08-25T16:00:00.000Z',
        source: 'api',
        strategy: 'percentage',
        versions: [
          { version_id: '22222222-2222-4222-8222-222222222222', percentage: 100 },
        ],
        ...overrides,
      },
    ],
  };
}

function pagesDeployment(overrides = {}) {
  return {
    id: 'pages-current',
    project_name: 'founder-control-room',
    environment: 'production',
    is_skipped: false,
    created_on: '2026-08-25T16:00:00.000Z',
    url: 'https://pages-current.founder-control-room.pages.dev',
    latest_stage: { name: 'deploy', status: 'success' },
    deployment_trigger: {
      type: 'github:push',
      metadata: { branch: 'main', commit_hash: OLD_SHA },
    },
    ...overrides,
  };
}

describe('production rollback receipt', () => {
  it('captures the active Worker deployment and complete traffic distribution', () => {
    expect(selectActiveWorkerDeployment(workerPayload())).toEqual({
      deploymentId: '11111111-1111-4111-8111-111111111111',
      createdOn: '2026-08-25T16:00:00.000Z',
      source: 'api',
      strategy: 'percentage',
      versions: [{ versionId: '22222222-2222-4222-8222-222222222222', percentage: 100 }],
    });

    expect(selectActiveWorkerDeployment(workerPayload({
      versions: [
        { version_id: '22222222-2222-4222-8222-222222222222', percentage: 25 },
        { version_id: '33333333-3333-4333-8333-333333333333', percentage: 75 },
      ],
    })).versions).toHaveLength(2);
  });

  it('fails closed on missing or incomplete Worker rollback identity', () => {
    expect(() => selectActiveWorkerDeployment({ deployments: [] })).toThrow(/no active deployment/i);
    expect(() => selectActiveWorkerDeployment(workerPayload({ versions: [] }))).toThrow(/missing rollback identity/i);
    expect(() => selectActiveWorkerDeployment(workerPayload({
      versions: [{ version_id: '', percentage: 100 }],
    }))).toThrow(/invalid version target/i);
    expect(() => selectActiveWorkerDeployment(workerPayload({
      versions: [{ version_id: '22222222-2222-4222-8222-222222222222', percentage: 95 }],
    }))).toThrow(/expected 100/i);
  });

  it('selects only a successful, non-skipped production Pages deployment on main', () => {
    expect(selectPagesRollbackDeployment([
      pagesDeployment({ id: 'preview', environment: 'preview' }),
      pagesDeployment({ id: 'failed', latest_stage: { name: 'deploy', status: 'failure' } }),
      pagesDeployment(),
    ])).toMatchObject({
      deploymentId: 'pages-current',
      branch: 'main',
      commitHash: OLD_SHA,
    });
  });

  it('rejects Pages candidates that are not rollback-eligible production deployments', () => {
    expect(() => selectPagesRollbackDeployment([
      pagesDeployment({ environment: 'preview' }),
      pagesDeployment({ deployment_trigger: { type: 'github:push', metadata: { branch: 'preview', commit_hash: OLD_SHA } } }),
    ])).toThrow(/no successful production deployment/i);
  });

  it('builds a credential-free, pre-mutation receipt with exact rollback coordinates', () => {
    const workerDeployment = selectActiveWorkerDeployment(workerPayload());
    const pages = selectPagesRollbackDeployment([pagesDeployment()]);
    const receipt = buildRollbackReceipt({
      intendedReleaseSha: SHA,
      workerName: 'founder-control-room',
      workerLiveGitSha: OLD_SHA,
      workerDeployment,
      pagesProject: 'founder-control-room',
      pagesDeployment: pages,
      capturedAt: '2026-08-25T17:00:00.000Z',
    });

    expect(receipt).toMatchObject({
      contract: 'fcr-production-rollback-receipt@v1',
      intendedReleaseSha: SHA,
      mutationPerformed: false,
      worker: {
        liveGitSha: OLD_SHA,
        activeDeployment: { deploymentId: '11111111-1111-4111-8111-111111111111' },
        rollback: {
          mechanism: 'cloudflare-worker-version-deployment',
          versions: [{ versionId: '22222222-2222-4222-8222-222222222222', percentage: 100 }],
        },
      },
      pages: {
        rollback: { mechanism: 'cloudflare-pages-deployment', deploymentId: 'pages-current' },
      },
    });
  });

  it('rejects malformed release identity before a receipt can be issued', () => {
    const workerDeployment = selectActiveWorkerDeployment(workerPayload());
    const pages = selectPagesRollbackDeployment([pagesDeployment()]);
    expect(() => buildRollbackReceipt({
      intendedReleaseSha: 'not-a-sha',
      workerName: 'founder-control-room',
      workerLiveGitSha: OLD_SHA,
      workerDeployment,
      pagesProject: 'founder-control-room',
      pagesDeployment: pages,
    })).toThrow(/intendedReleaseSha/);
  });
});
