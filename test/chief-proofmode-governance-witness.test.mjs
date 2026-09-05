import { describe, expect, it } from 'vitest';
import {
  CHIEF_REPOSITORY,
  EXACT_HEAD_RULESET_ID,
  EXPECTED_CHIEF_BASE_SHA,
  FOUNDER_GITHUB_USER_ID,
  GOVERNANCE_BOUNDARY_RULESET_ID,
  LEGACY_PREMERGE_CONTEXTS,
  PROOFMODE_RUNTIME_JOB,
  PROOFMODE_WORKFLOW_BLOB_SHA,
  PROOFMODE_WORKFLOW_PATH,
  TRUSTED_WITNESS_CONTEXT,
  evaluateChiefProofModeGovernanceEvidence,
  stableFingerprint,
} from '../scripts/chief-proofmode-governance-witness.mjs';

const APP_ID = '424242';
const HEAD = 'a'.repeat(40);
const HEAD_REF = 'fix/proofmode-main-audit-20260828';
const TRUSTED_FCR_MAIN = 'f'.repeat(40);

function check(context, integrationId = null) {
  return { context, integration_id: integrationId };
}

function ruleset({
  id,
  name,
  checks = [],
  bypassActors = [],
  include = ['~DEFAULT_BRANCH'],
  enforcement = 'active',
} = {}) {
  return {
    id,
    name,
    target: 'branch',
    enforcement,
    conditions: { ref_name: { include, exclude: [] } },
    bypass_actors: bypassActors,
    rules: [{
      type: 'required_status_checks',
      parameters: { required_status_checks: checks },
    }],
  };
}

function evidence(overrides = {}) {
  const pullRequest = {
    number: 143,
    state: 'open',
    merged: false,
    base: {
      ref: 'main',
      sha: EXPECTED_CHIEF_BASE_SHA,
      repo: { full_name: CHIEF_REPOSITORY },
    },
    head: {
      ref: HEAD_REF,
      sha: HEAD,
      repo: { full_name: CHIEF_REPOSITORY },
    },
  };
  const workflowFile = { sha: PROOFMODE_WORKFLOW_BLOB_SHA };
  const workflowRun = {
    id: 998877,
    run_attempt: 1,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_sha: HEAD,
    head_branch: HEAD_REF,
    path: PROOFMODE_WORKFLOW_PATH,
    actor: { login: 'jussray', id: Number(FOUNDER_GITHUB_USER_ID) },
    triggering_actor: { login: 'jussray', id: Number(FOUNDER_GITHUB_USER_ID) },
    repository: { full_name: CHIEF_REPOSITORY },
  };
  const jobs = [{
    id: 123,
    name: PROOFMODE_RUNTIME_JOB,
    status: 'completed',
    conclusion: 'success',
  }];
  const rulesets = [
    ruleset({
      id: GOVERNANCE_BOUNDARY_RULESET_ID,
      name: 'governance boundary',
      checks: [check('Verify operational authority', 15368)],
      bypassActors: [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }],
    }),
    ruleset({
      id: EXACT_HEAD_RULESET_ID,
      name: 'Chief AI main exact-head gate',
      checks: [
        check('Typecheck', 15368),
        check('Lint', 15368),
        check(TRUSTED_WITNESS_CONTEXT, Number(APP_ID)),
      ],
      bypassActors: [],
    }),
  ];

  return {
    appId: APP_ID,
    trustedFcrMainSha: TRUSTED_FCR_MAIN,
    pullRequestNumber: 143,
    pullRequest,
    workflowFile,
    workflowRun,
    jobs,
    rulesets,
    ...overrides,
  };
}

function classifications(result) {
  return result.violations.map((item) => item.classification);
}

describe('FCR-owned Chief ProofMode governance witness', () => {
  it('verifies only the exact founder dispatch, pinned workflow blob, no-bypass carrier, and FCR App issuer', () => {
    const result = evaluateChiefProofModeGovernanceEvidence(evidence());
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('VERIFIED');
    expect(result.providerMutationPerformed).toBe(false);
    expect(result.providerReceiptReused).toBe(false);
    expect(result.headSha).toBe(HEAD);
    expect(result.trustedAppId).toBe(APP_ID);
    expect(result.trustedWitnessContext).toBe(TRUSTED_WITNESS_CONTEXT);
    expect(result.evidence.trustedFcrMainSha).toBe(TRUSTED_FCR_MAIN);
    expect(result.evidence.workflowRunActorId).toBe(FOUNDER_GITHUB_USER_ID);
    expect(result.evidence.workflowRunTriggeringActorId).toBe(FOUNDER_GITHUB_USER_ID);
    expect(result.violations).toEqual([]);
    expect(result.evidenceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects every legacy or GitHub-Actions-owned candidate context from pre-merge governance', () => {
    for (const legacyContext of LEGACY_PREMERGE_CONTEXTS) {
      const input = evidence();
      input.rulesets[0].rules[0].parameters.required_status_checks.push(check(legacyContext, 15368));
      const result = evaluateChiefProofModeGovernanceEvidence(input);
      expect(classifications(result)).toContain('legacy-or-spoofable-proofmode-context-still-required');
      expect(result.ok).toBe(false);
    }
  });

  it('rejects unknown or non-empty bypass state on the authoritative exact-head carrier', () => {
    const unknown = evidence();
    delete unknown.rulesets[1].bypass_actors;
    const unknownResult = evaluateChiefProofModeGovernanceEvidence(unknown);
    expect(classifications(unknownResult)).toContain('exact-head-bypass-observation-incomplete');

    const bypassable = evidence();
    bypassable.rulesets[1].bypass_actors = [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }];
    const bypassableResult = evaluateChiefProofModeGovernanceEvidence(bypassable);
    expect(classifications(bypassableResult)).toContain('exact-head-ruleset-bypassable');
  });

  it('rejects the trusted witness when another ruleset carries it or the App integration is wrong', () => {
    const wrongIntegration = evidence();
    wrongIntegration.rulesets[1].rules[0].parameters.required_status_checks = [
      check(TRUSTED_WITNESS_CONTEXT, 15368),
    ];
    const wrongIntegrationResult = evaluateChiefProofModeGovernanceEvidence(wrongIntegration);
    expect(classifications(wrongIntegrationResult)).toContain('trusted-witness-integration-mismatch');

    const wrongCarrier = evidence();
    wrongCarrier.rulesets[0].rules[0].parameters.required_status_checks.push(
      check(TRUSTED_WITNESS_CONTEXT, Number(APP_ID)),
    );
    const wrongCarrierResult = evaluateChiefProofModeGovernanceEvidence(wrongCarrier);
    expect(classifications(wrongCarrierResult)).toContain('trusted-witness-required-by-wrong-ruleset');
  });

  it('rejects any change to the audited ProofMode workflow blob', () => {
    const input = evidence({ workflowFile: { sha: 'b'.repeat(40) } });
    const result = evaluateChiefProofModeGovernanceEvidence(input);
    expect(classifications(result)).toContain('proofmode-workflow-blob-mismatch');
    expect(result.ok).toBe(false);
  });

  it('rejects non-founder, non-dispatch, wrong-head, wrong-path, or unsuccessful workflow runs', () => {
    const variants = [
      ['workflow-run-actor-not-founder', { actor: { login: 'someone-else', id: 7 } }],
      ['workflow-run-actor-not-founder', { actor: { login: 'jussray', id: 7 } }],
      ['workflow-run-event-not-founder-dispatch', { event: 'pull_request' }],
      ['workflow-run-head-mismatch', { head_sha: 'c'.repeat(40) }],
      ['workflow-run-branch-mismatch', { head_branch: 'other-branch' }],
      ['workflow-run-path-mismatch', { path: '.github/workflows/other.yml' }],
      ['workflow-run-not-successful', { conclusion: 'failure' }],
    ];

    for (const [expected, patch] of variants) {
      const input = evidence();
      input.workflowRun = { ...input.workflowRun, ...patch };
      const result = evaluateChiefProofModeGovernanceEvidence(input);
      expect(classifications(result)).toContain(expected);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a non-founder rerun even when the original workflow actor is the founder', () => {
    const input = evidence();
    input.workflowRun.run_attempt = 2;
    input.workflowRun.triggering_actor = { login: 'someone-else', id: 7 };
    const result = evaluateChiefProofModeGovernanceEvidence(input);
    expect(classifications(result)).toContain('workflow-run-triggering-actor-not-founder');
    expect(result.ok).toBe(false);
  });

  it('rejects missing, duplicate, or unsuccessful candidate runtime jobs', () => {
    const missing = evaluateChiefProofModeGovernanceEvidence(evidence({ jobs: [] }));
    expect(classifications(missing)).toContain('candidate-runtime-job-cardinality');

    const duplicateInput = evidence();
    duplicateInput.jobs.push({ ...duplicateInput.jobs[0], id: 124 });
    const duplicate = evaluateChiefProofModeGovernanceEvidence(duplicateInput);
    expect(classifications(duplicate)).toContain('candidate-runtime-job-cardinality');

    const failedInput = evidence();
    failedInput.jobs[0].conclusion = 'failure';
    const failed = evaluateChiefProofModeGovernanceEvidence(failedInput);
    expect(classifications(failed)).toContain('candidate-runtime-job-not-successful');
  });

  it('expires when FCR trust-root main, Chief main, or PR identity moves', () => {
    const invalidTrustRoot = evaluateChiefProofModeGovernanceEvidence(
      evidence({ trustedFcrMainSha: 'not-a-sha' }),
    );
    expect(classifications(invalidTrustRoot)).toContain('trusted-fcr-main-sha-invalid');

    const movedBase = evidence();
    movedBase.pullRequest.base.sha = 'd'.repeat(40);
    const movedBaseResult = evaluateChiefProofModeGovernanceEvidence(movedBase);
    expect(classifications(movedBaseResult)).toContain('trusted-base-moved');

    const forkedHead = evidence();
    forkedHead.pullRequest.head.repo.full_name = 'attacker/chief-ai-machine';
    const forkedHeadResult = evaluateChiefProofModeGovernanceEvidence(forkedHead);
    expect(classifications(forkedHeadResult)).toContain('head-repository-mismatch');
  });

  it('binds the receipt fingerprint to the exact trusted FCR main SHA', () => {
    const first = evaluateChiefProofModeGovernanceEvidence(evidence());
    const second = evaluateChiefProofModeGovernanceEvidence(
      evidence({ trustedFcrMainSha: 'e'.repeat(40) }),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.evidenceFingerprint).not.toBe(second.evidenceFingerprint);
  });

  it('produces a stable fingerprint and changes it when governed evidence changes', () => {
    const a = stableFingerprint({ z: 1, nested: { b: 2, a: 1 } });
    const b = stableFingerprint({ nested: { a: 1, b: 2 }, z: 1 });
    const c = stableFingerprint({ nested: { a: 1, b: 3 }, z: 1 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
