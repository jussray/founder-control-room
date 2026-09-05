import { describe, expect, it } from "vitest";

import {
  CHIEF_GOVERNANCE,
  createTrustedGithubRulesetObservation,
  planChiefProofModeRulesetMigration,
} from "../githubGovernanceReconciliation.js";

const OBSERVER_APP_ID = "85455";

function rulesetReadback(overrides: Record<string, unknown> = {}) {
  return {
    id: 21261587,
    name: "governance boundary",
    target: "branch",
    enforcement: "active",
    bypass_actors: [{ actor_type: "Integration", actor_id: 85455, bypass_mode: "pull_request" }],
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [{
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "Verify operational authority", integration_id: 15368 },
          { context: "Verify live ProofMode MCP with Playwright", integration_id: 15368 },
          { context: "Verify production ProofMode MCP with Playwright", integration_id: 15368 },
        ],
      },
    }],
    ...overrides,
  };
}

function observe(readback: Record<string, unknown>) {
  return createTrustedGithubRulesetObservation({
    repository: CHIEF_GOVERNANCE.repository,
    rulesetId: String(readback.id),
    readback,
    observerAppId: OBSERVER_APP_ID,
    observedAt: "2026-09-05T21:15:00.000Z",
  });
}

function pair() {
  const governanceBoundary = observe(rulesetReadback());
  const exactHeadGate = observe(rulesetReadback({
    id: 20818149,
    name: "Chief AI main exact-head gate",
    bypass_actors: [],
    rules: [{
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "Typecheck" },
          { context: "Verify test-ledger contract", integration_id: 15368 },
        ],
      },
    }],
  }));
  return { governanceBoundary, exactHeadGate };
}

describe("Chief GitHub governance reconciliation", () => {
  it("fails closed before planning until an external candidate-check producer is observed", () => {
    expect(CHIEF_GOVERNANCE.candidateIntegrationId).toBeNull();
    expect(CHIEF_GOVERNANCE.candidateProducerTrust).toBe("external-github-app-check-required");
    expect(() => planChiefProofModeRulesetMigration(pair())).toThrow(
      /external check producer integration is not yet observed/,
    );
  });

  it("does not accept GitHub Actions integration 15368 as proof of the intended candidate workflow", () => {
    const input = pair();
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [],
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: CHIEF_GOVERNANCE.candidateContext, integration_id: 15368 },
          ],
        },
      }],
    }));

    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(
      /refusing to plan a GitHub Actions-only required check/,
    );
  });

  it("does not manufacture a replacement producer when a same-named candidate check has another integration", () => {
    const input = pair();
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [],
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: CHIEF_GOVERNANCE.candidateContext, integration_id: 99999 },
          ],
        },
      }],
    }));

    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(
      /external check producer integration is not yet observed/,
    );
  });

  it("fails closed when the authoritative candidate ruleset has a bypass actor before producer planning", () => {
    const input = pair();
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
    }));

    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(/zero bypass actors/);
  });

  it("observes required deployments and rejects post-merge production as a pre-merge rule", () => {
    const input = pair();
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [],
      rules: [
        {
          type: "required_status_checks",
          parameters: { required_status_checks: [{ context: "Typecheck" }] },
        },
        {
          type: "required_deployments",
          parameters: {
            required_deployment_environments: ["Cloudflare Production", "proofmode-access-admin"],
          },
        },
      ],
    }));

    expect(input.exactHeadGate.requiredDeploymentEnvironments).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(
      /post-merge-only deployment environment Cloudflare Production is required pre-merge/,
    );
  });

  it("preserves observed unrelated required-check producer bindings without upgrading them to candidate authority", () => {
    const { exactHeadGate } = pair();

    expect(exactHeadGate.requiredStatusChecks).toContainEqual({
      context: "Verify test-ledger contract",
      integrationId: "15368",
    });
    expect(exactHeadGate.requiredStatusChecks).toContainEqual({
      context: "Typecheck",
      integrationId: null,
    });
    expect(CHIEF_GOVERNANCE.candidateIntegrationId).toBeNull();
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
            { context: "Typecheck", integration_id: 15368 },
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
      observerAppId: OBSERVER_APP_ID,
      observedAt: "2026-09-05T21:15:00.000Z",
    })).toThrow(/pinned to jussray\/chief-ai-machine/);

    expect(() => createTrustedGithubRulesetObservation({
      repository: CHIEF_GOVERNANCE.repository,
      rulesetId: 20818149,
      readback: rulesetReadback(),
      observerAppId: OBSERVER_APP_ID,
      observedAt: "2026-09-05T21:15:00.000Z",
    })).toThrow(/provider ruleset id mismatch/);
  });
});
