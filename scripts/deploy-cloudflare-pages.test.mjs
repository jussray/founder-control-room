import { describe, expect, it } from 'vitest';
import {
  isNewExactProductionHookDeployment,
  safeDeploymentSummary,
} from './deploy-cloudflare-pages.mjs';

const exactSha = 'a'.repeat(40);

function deployment(overrides = {}) {
  return {
    id: 'deployment-new',
    project_name: 'founder-control-room',
    environment: 'production',
    is_skipped: false,
    created_on: '2026-08-18T03:00:00.000Z',
    url: 'https://deployment-new.founder-control-room.pages.dev',
    latest_stage: { name: 'deploy', status: 'success' },
    deployment_trigger: {
      type: 'deploy_hook',
      metadata: {
        branch: 'main',
        commit_hash: exactSha,
        commit_dirty: false,
        commit_message: 'release',
      },
    },
    ...overrides,
  };
}

describe('Cloudflare Pages deploy-hook identity contract', () => {
  it('accepts only a new production deploy-hook deployment for the exact main SHA', () => {
    expect(
      isNewExactProductionHookDeployment(deployment(), {
        baselineIds: new Set(['deployment-old']),
        expectedSha: exactSha,
      }),
    ).toBe(true);
  });

  it('rejects a stale deployment even when the SHA matches', () => {
    expect(
      isNewExactProductionHookDeployment(deployment({ id: 'deployment-old' }), {
        baselineIds: new Set(['deployment-old']),
        expectedSha: exactSha,
      }),
    ).toBe(false);
  });

  it.each([
    ['wrong SHA', { deployment_trigger: { type: 'deploy_hook', metadata: { branch: 'main', commit_hash: 'b'.repeat(40) } } }],
    ['preview environment', { environment: 'preview' }],
    ['wrong trigger', { deployment_trigger: { type: 'github:push', metadata: { branch: 'main', commit_hash: exactSha } } }],
    ['wrong branch', { deployment_trigger: { type: 'deploy_hook', metadata: { branch: 'preview', commit_hash: exactSha } } }],
    ['wrong project', { project_name: 'other-project' }],
  ])('rejects %s', (_label, override) => {
    expect(
      isNewExactProductionHookDeployment(deployment(override), {
        baselineIds: new Set(),
        expectedSha: exactSha,
      }),
    ).toBe(false);
  });

  it('emits a credential-free provider receipt summary', () => {
    expect(safeDeploymentSummary(deployment())).toEqual({
      id: 'deployment-new',
      createdOn: '2026-08-18T03:00:00.000Z',
      environment: 'production',
      triggerType: 'deploy_hook',
      branch: 'main',
      commitHash: exactSha,
      stage: 'deploy',
      status: 'success',
      url: 'https://deployment-new.founder-control-room.pages.dev',
    });
  });
});
