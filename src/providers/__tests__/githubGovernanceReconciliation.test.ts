import { describe, expect, it } from "vitest";

import {
  CHIEF_GOVERNANCE,
  createTrustedGithubRulesetObservation,
  planChiefProofModeRulesetMigration,
  verifyChiefProofModeRulesetsAsIs,
} from "../githubGovernanceReconciliation.js";

const GITHUB_ACTIONS_APP_ID = "15368";
const CLOUDFLARE_WORKERS_APP_ID = "85455";
const SYNTHETIC_OBSERVER_APP_ID = "900000001";

function rulesetReadback(overrides: Record<string, unknown> = {}) {
  return {
    id: 21261587,
    name: "governance boundary",
    target: "branch",
    enforcement: "active",
    bypass_actors: [{
      actor_type: "Integration",
      actor_id: Number(SYNTHETIC_OBSERVER_APP_ID),
      bypass_mode: "pull_request",
    }],
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [{
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "Verify operational authority", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
          { context: "Verify live ProofMode MCP with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
          { context: "Verify production ProofMode MCP with Playwright", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
        ],
      },
    }],
    ...overrides,
  };
}

function exactHeadReadback(overrides: Record<string, unknown> = {}) {
  return rulesetReadback({
    id: 20818149,
    name: "Chief AI main exact-head gate",
    bypass_actors: [],
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "Typecheck" },
            { context: "Verify test-ledger contract", integration_id: Number(GITHUB_ACTIONS_APP_ID) },
          ],
        },
      },
      {
        type: "required_deployments",
        parameters: {
          required_deployment_environments: ["Cloudflare Production", "proofmode-access-admin"],
        },
      },
    ],
    ...overrides,
  });
}

function observe(readback: Record<string, unknown>) {
  return createTrustedGithubRulesetObservation({
    repository: CHIEF_GOVERNANCE.repository,
    rulesetId: String(readback.id),
    readback,
    observerAppId: SYNTHETIC_OBSERVER_APP_ID,
    observedAt: "2026-09-05T21:15:00.000Z",
  });
}

function pair() {
  return {
    governanceBoundary: observe(rulesetReadback()),
    exactHeadGate: observe(exactHeadReadback()),
  };
}

describe("Chief GitHub governance reconciliation", () => {
  it("keeps the observer identity explicitly synthetic instead of borrowing a real provider App id", () => {
    expect(SYNTHETIC_OBSERVER_APP_ID).not.toBe(GITHUB_ACTIONS_APP_ID);
    expect(SYNTHETIC_OBSERVER_APP_ID).not.toBe(CLOUDFLARE_WORKERS_APP_ID);
  });

  it("accepts the founder-approved exact-head ruleset exactly as observed and emits no mutation", () => {
    const verification = verifyChiefProofModeRulesetsAsIs(pair());

    expect(CHIEF_GOVERNANCE.candidateIntegrationId).toBeNull();
    expect(CHIEF_GOVERNANCE.candidateProducerTrust).toBe("external-github-app-check-required");
    expect(CHIEF_GOVERNANCE.requiredExactHeadDeploymentEnvironments).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
    expect(verification.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(verification.changesRequired).toBe(false);
    expect(verification.mutationRequired).toBe(false);
    expect(verification.mutation).toBeNull();
    expect(verification.candidateProducer.requiredByRuleset).toBe(false);
    expect(verification.observedRequiredDeploymentEnvironments.exactHeadGate).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
  });

  it("keeps the legacy planner name as a no-mutation compatibility wrapper", () => {
    const verification = planChiefProofModeRulesetMigration(pair());
    expect(verification.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(verification.changesRequired).toBe(false);
    expect(verification.mutationRequired).toBe(false);
    expect(verification.mutation).toBeNull();
  });

  it("does not require an external candidate producer before accepting the approved live ruleset", () => {
    expect(CHIEF_GOVERNANCE.candidateIntegrationId).toBeNull();
    expect(() => verifyChiefProofModeRulesetsAsIs(pair())).not.toThrow();
  });

  it("fails closed if the reserved candidate runtime context is added to the exact-head ruleset", () => {
    const input = pair();
    input.exactHeadGate = observe(exactHeadReadback({
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: [
              { context: "Typecheck" },
              { context: CHIEF_GOVERNANCE.candidateContext, integration_id: Number(GITHUB_ACTIONS_APP_ID) },
            ],
          },
        },
        {
          type: "required_deployments",
          parameters: {
            required_deployment_environments: ["Cloudflare Production", "proofmode-access-admin"],
          },
        },
      ],
    }));

    expect(() => verifyChiefProofModeRulesetsAsIs(input)).toThrow(/reserved candidate runtime context must remain unbound/);
  });

  it("fails closed when the authoritative exact-head ruleset gains a bypass actor", () => {
    const input = pair();
    input.exactHeadGate = observe(exactHeadReadback({
      bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
    }));

    expect(() => verifyChiefProofModeRulesetsAsIs(input)).toThrow(/zero bypass actors/);
  });

  it("fails closed if either founder-approved required deployment disappears", () => {
    for (const required of CHIEF_GOVERNANCE.requiredExactHeadDeploymentEnvironments) {
      const remaining = CHIEF_GOVERNANCE.requiredExactHeadDeploymentEnvironments.filter(
        (environment) => environment !== required,
      );
      const input = pair();
      input.exactHeadGate = observe(exactHeadReadback({
        rules: [
          {
            type: "required_status_checks",
            parameters: { required_status_checks: [{ context: "Typecheck" }] },
          },
          {
            type: "required_deployments",
            parameters: { required_deployment_environments: remaining },
          },
        ],
      }));

      expect(() => verifyChiefProofModeRulesetsAsIs(input)).toThrow(/required deployments drifted/);
    }
  });

  it("fails closed if an unapproved required deployment is added", () => {
    const input = pair();
    input.exactHeadGate = observe(exactHeadReadback({
      rules: [
        {
          type: "required_status_checks",
          parameters: { required_status_checks: [{ context: "Typecheck" }] },
        },
        {
          type: "required_deployments",
          parameters: {
            required_deployment_environments: [
              "Cloudflare Production",
              "proofmode-access-admin",
              "unexpected-provider-gate",
            ],
          },
        },
      ],
    }));

    expect(() => verifyChiefProofModeRulesetsAsIs(input)).toThrow(/required deployments drifted/);
  });

  it("preserves observed required-check producer bindings without upgrading them to candidate authority", () => {
    const verification = verifyChiefProofModeRulesetsAsIs(pair());

    expect(verification.observedRequiredStatusChecks.exactHeadGate).toContainEqual({
      context: "Verify test-ledger contract",
      integrationId: GITHUB_ACTIONS_APP_ID,
    });
    expect(verification.observedRequiredStatusChecks.exactHeadGate).toContainEqual({
      context: "Typecheck",
      integrationId: null,
    });
    expect(verification.candidateProducer.integrationId).toBeNull();
    expect(verification.candidateProducer.requiredByRuleset).toBe(false);
  });

  it("fails closed when bypass state is not present in provider readback", () => {
    const { bypass_actors: _bypassActors, ...withoutBypassActors } = rulesetReadback();
    expect(() => observe(withoutBypassActors)).toThrow(/bypass actors must be provider-observed/);
  });

  it("fails closed on duplicate required-check contexts", () => {
    expect(() => observe(rulesetReadback({
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
    const first = observe(rulesetReadback());
    const second = observe(rulesetReadback({ enforcement: "evaluate" }));

    expect(first.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.providerFingerprint).not.toBe(second.providerFingerprint);
  });

  it("pins observations to Chief and to the exact provider ruleset id", () => {
    expect(() => createTrustedGithubRulesetObservation({
      repository: "jussray/founder-control-room",
      rulesetId: 21261587,
      readback: rulesetReadback(),
      observerAppId: SYNTHETIC_OBSERVER_APP_ID,
      observedAt: "2026-09-05T21:15:00.000Z",
    })).toThrow(/pinned to jussray\/chief-ai-machine/);

    expect(() => createTrustedGithubRulesetObservation({
      repository: CHIEF_GOVERNANCE.repository,
      rulesetId: 20818149,
      readback: rulesetReadback(),
      observerAppId: SYNTHETIC_OBSERVER_APP_ID,
      observedAt: "2026-09-05T21:15:00.000Z",
    })).toThrow(/provider ruleset id mismatch/);
  });
});
