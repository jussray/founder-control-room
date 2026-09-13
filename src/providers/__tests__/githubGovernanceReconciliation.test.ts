import { describe, expect, it } from "vitest";

import {
  CHIEF_GOVERNANCE,
  createTrustedGithubRulesetObservation,
  planChiefProofModeRulesetMigration,
  verifyChiefProofModeRulesetsAsIs,
} from "../githubGovernanceReconciliation.js";

const GITHUB_ACTIONS_APP_ID = "15368";
const SYNTHETIC_OBSERVER_APP_ID = "900000001";

function governanceBoundaryReadback(overrides: Record<string, unknown> = {}) {
  return {
    id: 21261587,
    name: "governance boundary",
    target: "branch",
    enforcement: "active",
    bypass_actors: [
      { actor_type: "DeployKey", actor_id: null, bypass_mode: "always" },
      { actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" },
      { actor_type: "Integration", actor_id: 1144995, bypass_mode: "always" },
    ],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH", "refs/heads/governance boundary"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "required_linear_history" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: true,
          require_last_push_approval: true,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [
            { context: "Publish exact-head test ledger", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Redacted provider receipt", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Typecheck", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify Founder Goals desktop and mobile flow", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify Freestyle, Goalfix, and PromptOS in Chromium", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify exact Chief runtime with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify live Chief capability plan with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify live ProofMode MCP with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify operational authority", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            { context: "Verify production ProofMode MCP with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
          ],
        },
      },
      { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
    ],
    ...overrides,
  };
}

function exactHeadReadback(overrides: Record<string, unknown> = {}) {
  return {
    id: 20818149,
    name: "Chief AI main exact-head gate",
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [
            { context: "Typecheck" },
            { context: "Lint" },
            { context: "Unit Tests" },
            { context: "SonarQube – Founder Intelligence" },
            { context: "Verify test-ledger contract" },
          ],
        },
      },
      { type: "required_linear_history" },
      { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
      {
        type: "required_deployments",
        parameters: {
          required_deployment_environments: ["Cloudflare Production", "proofmode-access-admin"],
        },
      },
    ],
    ...overrides,
  };
}

function observe(readback: Record<string, unknown>, observerAppId = SYNTHETIC_OBSERVER_APP_ID) {
  return createTrustedGithubRulesetObservation({
    repository: CHIEF_GOVERNANCE.repository,
    rulesetId: String(readback.id),
    readback,
    observerAppId,
    observedAt: "2026-09-13T16:00:00.000Z",
  });
}

function currentPair() {
  return {
    governanceBoundary: observe(governanceBoundaryReadback()),
    exactHeadGate: observe(exactHeadReadback()),
  };
}

function convergedPair() {
  return {
    governanceBoundary: observe(governanceBoundaryReadback({
      bypass_actors: [],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "required_linear_history" },
        {
          type: "pull_request",
          parameters: {
            dismiss_stale_reviews_on_push: true,
            require_last_push_approval: true,
            required_review_thread_resolution: true,
          },
        },
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: [
              { context: "Typecheck", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
              { context: "Verify operational authority", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            ],
          },
        },
        { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
      ],
    })),
    exactHeadGate: observe(exactHeadReadback({
      bypass_actors: [],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: [
              { context: "Typecheck" },
              { context: "Lint" },
              { context: "Unit Tests" },
              { context: "SonarQube – Founder Intelligence" },
              { context: "Verify test-ledger contract" },
              { context: CHIEF_GOVERNANCE.candidateContext, integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            ],
          },
        },
        { type: "required_linear_history" },
        { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
      ],
    })),
  };
}

describe("Chief GitHub governance reconciliation", () => {
  it("supersedes the old as-is topology with a non-authorizing producer-correct plan", () => {
    const plan = planChiefProofModeRulesetMigration(currentPair());

    expect(CHIEF_GOVERNANCE.candidateIntegrationId).toBe(GITHUB_ACTIONS_APP_ID);
    expect(plan.disposition).toBe("MUTATION_REQUIRED");
    expect(plan.changesRequired).toBe(true);
    expect(plan.mutationRequired).toBe(true);
    expect(plan.mutation?.executionAuthorized).toBe(false);
    expect(plan.mutation?.requiresFreshProviderReadback).toBe(true);
    expect(plan.authority.providerMutationAuthority).toBe(false);
    expect(plan.authority.mergeAuthority).toBe(false);
    expect(plan.authority.deployAuthority).toBe(false);
  });

  it("moves candidate ProofMode proof onto the no-bypass exact-head carrier and binds producer identity", () => {
    const plan = planChiefProofModeRulesetMigration(currentPair());
    const exact = plan.mutation?.exactHeadGate;

    expect(plan.candidateProducer).toEqual({
      context: "Verify candidate ProofMode runtime with Playwright",
      integrationId: GITHUB_ACTIONS_APP_ID,
      trust: "github-actions-integration-bound",
      requiredByRuleset: true,
      carrierRulesetId: "20818149",
    });
    expect(exact?.desiredBypassActors).toEqual([]);
    expect(exact?.desiredRequiredStatusChecks).toContainEqual({
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: GITHUB_ACTIONS_APP_ID,
    });
    expect(exact?.desiredRequiredStatusChecks).toContainEqual({ context: "Typecheck", integrationId: null });
    expect(exact?.requireStrictStatusFreshness).toBe(true);
    expect(exact?.preserveUnmanagedRules).toBe(true);
  });

  it("removes pre-merge deployment requirements without erasing the post-merge production truth obligation", () => {
    const plan = planChiefProofModeRulesetMigration(currentPair());

    expect(plan.observedRequiredDeploymentEnvironments.exactHeadGate).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
    expect(plan.mutation?.exactHeadGate.desiredRequiredDeploymentEnvironments).toEqual([]);
    expect(plan.mutation?.exactHeadGate.changes.requiredDeploymentEnvironments.removed).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
    expect(plan.postMergeProductionProof).toEqual({
      requiredDeploymentEnvironments: ["Cloudflare Production", "proofmode-access-admin"],
      preMergeRequired: false,
      truthPlane: "post-merge-current-main",
    });
  });

  it("narrows unconditional governance checks to contexts that materialize for every PR", () => {
    const plan = planChiefProofModeRulesetMigration(currentPair());
    const boundary = plan.mutation?.governanceBoundary;

    expect(boundary?.desiredRequiredStatusChecks).toEqual([
      { context: "Typecheck", integrationId: GITHUB_ACTIONS_APP_ID },
      { context: "Verify operational authority", integrationId: GITHUB_ACTIONS_APP_ID },
    ]);
    expect(boundary?.changes.statusChecks.removed.map((check) => check.context)).toEqual([
      "Publish exact-head test ledger",
      "Redacted provider receipt",
      "Verify Founder Goals desktop and mobile flow",
      "Verify Freestyle, Goalfix, and PromptOS in Chromium",
      "Verify exact Chief runtime with Playwright",
      "Verify live Chief capability plan with Playwright",
      "Verify live ProofMode MCP with Playwright",
      "Verify production ProofMode MCP with Playwright",
    ]);
  });

  it("plans removal of every observed bypass actor, including GitHub DeployKey actors with null actor ids", () => {
    const input = currentPair();
    expect(input.governanceBoundary.bypassActors[0]).toEqual({
      actorType: "DeployKey",
      actorId: null,
      bypassMode: "always",
    });

    const plan = planChiefProofModeRulesetMigration(input);
    expect(plan.mutation?.governanceBoundary.desiredBypassActors).toEqual([]);
    expect(plan.mutation?.governanceBoundary.changes.bypassActors.removed).toEqual(
      input.governanceBoundary.bypassActors,
    );
  });

  it("reports NO_CHANGE_REQUIRED only after the producer-correct topology is independently observed", () => {
    const plan = planChiefProofModeRulesetMigration(convergedPair());

    expect(plan.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(plan.changesRequired).toBe(false);
    expect(plan.mutationRequired).toBe(false);
    expect(plan.mutation).toBeNull();
    expect(plan.candidateProducer.requiredByRuleset).toBe(true);
    expect(plan.postMergeProductionProof.preMergeRequired).toBe(false);
  });

  it("keeps the deprecated verifier name aligned with the new founder decision", () => {
    const plan = verifyChiefProofModeRulesetsAsIs(currentPair());
    expect(plan.disposition).toBe("MUTATION_REQUIRED");
    expect(plan.mutation?.executionAuthorized).toBe(false);
  });

  it("replaces a wrong candidate producer binding instead of accepting check-name equality as authority", () => {
    const input = currentPair();
    input.exactHeadGate = observe(exactHeadReadback({
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: [
              { context: "Typecheck" },
              { context: CHIEF_GOVERNANCE.candidateContext, integration_id: 99999 },
            ],
          },
        },
      ],
    }));

    const plan = planChiefProofModeRulesetMigration(input);
    expect(plan.mutation?.exactHeadGate.changes.statusChecks.removed).toContainEqual({
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: "99999",
    });
    expect(plan.mutation?.exactHeadGate.changes.statusChecks.added).toContainEqual({
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: GITHUB_ACTIONS_APP_ID,
    });
  });

  it("fails closed when the two rulesets are observed by different GitHub App identities", () => {
    const input = currentPair();
    input.exactHeadGate = observe(exactHeadReadback(), "900000002");
    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(/same trusted GitHub App observer/);
  });

  it("fails closed when bypass state is absent from provider readback", () => {
    const { bypass_actors: _bypassActors, ...withoutBypassActors } = governanceBoundaryReadback();
    expect(() => observe(withoutBypassActors)).toThrow(/bypass actors must be provider-observed/);
  });

  it("fails closed on duplicate required-check contexts", () => {
    expect(() => observe(governanceBoundaryReadback({
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "Typecheck" },
            { context: "Typecheck", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
          ],
        },
      }],
    }))).toThrow(/duplicate required status check context/);
  });

  it("changes the provider fingerprint when any observed provider state changes", () => {
    const first = observe(governanceBoundaryReadback());
    const second = observe(governanceBoundaryReadback({ enforcement: "evaluate" }));

    expect(first.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.providerFingerprint).not.toBe(second.providerFingerprint);
  });

  it("pins observations to Chief and to the exact provider ruleset id", () => {
    expect(() => createTrustedGithubRulesetObservation({
      repository: "jussray/founder-control-room",
      rulesetId: 21261587,
      readback: governanceBoundaryReadback(),
      observerAppId: SYNTHETIC_OBSERVER_APP_ID,
      observedAt: "2026-09-13T16:00:00.000Z",
    })).toThrow(/pinned to jussray\/chief-ai-machine/);

    expect(() => createTrustedGithubRulesetObservation({
      repository: CHIEF_GOVERNANCE.repository,
      rulesetId: 20818149,
      readback: governanceBoundaryReadback(),
      observerAppId: SYNTHETIC_OBSERVER_APP_ID,
      observedAt: "2026-09-13T16:00:00.000Z",
    })).toThrow(/provider ruleset id mismatch/);
  });
});
