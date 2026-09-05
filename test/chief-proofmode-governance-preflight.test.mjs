import { describe, expect, it } from 'vitest';
import {
  CHIEF_REPOSITORY,
  EXACT_HEAD_RULESET_ID,
  EXPECTED_CHIEF_BASE_SHA,
  FOUNDER_GITHUB_USER_ID,
  GOVERNANCE_BOUNDARY_RULESET_ID,
} from '../scripts/chief-proofmode-governance-witness.mjs';
import {
  REQUIRED_APP_PERMISSIONS,
  evaluateChiefGovernancePreflight,
} from '../scripts/chief-proofmode-governance-preflight.mjs';

const APP_ID = '424242';
const TRUST_ROOT = 'f'.repeat(40);
const HEAD = 'a'.repeat(40);

function ruleset(id, name, bypassActors = []) {
  return {
    id,
    name,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    bypass_actors: bypassActors,
    rules: [],
  };
}

function input(overrides = {}) {
  return {
    appId: APP_ID,
    trustedFcrMainSha: TRUST_ROOT,
    installation: {
      id: 999,
      app_id: Number(APP_ID),
      account: { login: 'jussray', id: Number(FOUNDER_GITHUB_USER_ID) },
      repository_selection: 'selected',
      permissions: {
        actions: 'read',
        administration: 'read',
        checks: 'write',
        contents: 'read',
        metadata: 'read',
      },
    },
    repository: { full_name: CHIEF_REPOSITORY },
    pullRequest: {
      number: 143,
      state: 'open',
      merged: false,
      base: {
        ref: 'main',
        sha: EXPECTED_CHIEF_BASE_SHA,
        repo: { full_name: CHIEF_REPOSITORY },
      },
      head: {
        ref: 'fix/proofmode-main-audit-20260828',
        sha: HEAD,
        repo: { full_name: CHIEF_REPOSITORY },
      },
    },
    rulesets: [
      ruleset(GOVERNANCE_BOUNDARY_RULESET_ID, 'governance boundary', [
        { actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' },
      ]),
      ruleset(EXACT_HEAD_RULESET_ID, 'Chief AI main exact-head gate', []),
    ],
    actionsReadbackComplete: true,
    checksReadbackComplete: true,
    ...overrides,
  };
}

function classifications(result) {
  return result.violations.map((item) => item.classification);
}

describe('FCR-owned Chief governance trust-root preflight', () => {
  it('is ready only when App installation, permissions, readbacks, and exact-head no-bypass state are observed', () => {
    const result = evaluateChiefGovernancePreflight(input());
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('READY_FOR_GOVERNANCE_MIGRATION');
    expect(result.providerMutationPerformed).toBe(false);
    expect(result.trustedFcrMainSha).toBe(TRUST_ROOT);
    expect(result.app.appId).toBe(APP_ID);
    expect(result.app.installationAccountId).toBe(FOUNDER_GITHUB_USER_ID);
    expect(result.readback.exactHeadGate.bypassActorCount).toBe(0);
    expect(result.violations).toEqual([]);
  });

  it('rejects a missing or different App installation', () => {
    const missing = input();
    missing.installation.id = null;
    expect(classifications(evaluateChiefGovernancePreflight(missing)))
      .toContain('chief-app-installation-not-observed');

    const wrongApp = input();
    wrongApp.installation.app_id = 7;
    expect(classifications(evaluateChiefGovernancePreflight(wrongApp)))
      .toContain('chief-app-installation-app-id-mismatch');
  });

  it('rejects installation under a different GitHub account identity', () => {
    const wrongAccount = input();
    wrongAccount.installation.account = { login: 'someone-else', id: 7 };
    expect(classifications(evaluateChiefGovernancePreflight(wrongAccount)))
      .toContain('chief-app-installation-account-mismatch');
  });

  it('requires every declared App permission at or above the minimum level', () => {
    for (const permission of Object.keys(REQUIRED_APP_PERMISSIONS)) {
      const weakened = input();
      weakened.installation.permissions = {
        ...weakened.installation.permissions,
        [permission]: 'none',
      };
      const result = evaluateChiefGovernancePreflight(weakened);
      expect(result.ok).toBe(false);
      expect(result.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          classification: 'chief-app-permission-insufficient',
          permission,
        }),
      ]));
    }

    const writeImpliesRead = input();
    writeImpliesRead.installation.permissions.actions = 'write';
    expect(evaluateChiefGovernancePreflight(writeImpliesRead).ok).toBe(true);
  });

  it('fails closed when Actions or Check Run readback cannot be completed', () => {
    const noActions = evaluateChiefGovernancePreflight(input({ actionsReadbackComplete: false }));
    expect(classifications(noActions)).toContain('chief-actions-readback-incomplete');

    const noChecks = evaluateChiefGovernancePreflight(input({ checksReadbackComplete: false }));
    expect(classifications(noChecks)).toContain('chief-checks-readback-incomplete');
  });

  it('fails closed when bypass actors cannot be observed', () => {
    const missingBoundary = input();
    delete missingBoundary.rulesets[0].bypass_actors;
    expect(classifications(evaluateChiefGovernancePreflight(missingBoundary)))
      .toContain('governance-boundary-bypass-observation-incomplete');

    const missingExactHead = input();
    delete missingExactHead.rulesets[1].bypass_actors;
    expect(classifications(evaluateChiefGovernancePreflight(missingExactHead)))
      .toContain('exact-head-bypass-observation-incomplete');
  });

  it('rejects any bypass actor on the authoritative Chief exact-head ruleset', () => {
    const bypassable = input();
    bypassable.rulesets[1].bypass_actors = [
      { actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' },
    ];
    const result = evaluateChiefGovernancePreflight(bypassable);
    expect(classifications(result)).toContain('exact-head-ruleset-bypassable');
    expect(result.ok).toBe(false);
  });

  it('expires when the pinned FCR trust root or Chief base moves', () => {
    const badTrustRoot = evaluateChiefGovernancePreflight(input({ trustedFcrMainSha: 'bad' }));
    expect(classifications(badTrustRoot)).toContain('trusted-fcr-main-sha-invalid');

    const movedMain = input();
    movedMain.pullRequest.base.sha = 'b'.repeat(40);
    expect(classifications(evaluateChiefGovernancePreflight(movedMain)))
      .toContain('chief-main-moved');
  });
});
