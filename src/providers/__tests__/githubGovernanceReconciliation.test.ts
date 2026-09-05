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
  it("plans the exact migration but blocks provider mutation without an atomic precondition", () => {
    const plan = planChiefProofModeRulesetMigration(pair());

    expect(plan.changesRequired).toBe(true);
    expect(plan.disposition).toBe("BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE");
    expect(plan.atomicProviderPreconditionRequired).toBe(true);
    expect(plan.atomicProviderPreconditionAvailable).toBe(false);
    expect(plan.authority.providerMutationAuthority).toBe(false);
    expect(plan.authority.mergeAuthority).toBe(false);
    expect(plan.desiredRequiredStatusChecks.governanceBoundary).toEqual([
      { context: "Verify operational authority", integrationId: "15368" },
    ]);
    expect(plan.desiredRequiredStatusChecks.exactHeadGate).toContainEqual({
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: CHIEF_GOVERNANCE.candidateIntegrationId,
    });
  });

  it("preserves unrelated required-check producer bindings", () => {
    const plan = planChiefProofModeRulesetMigration(pair());

    expect(plan.desiredRequiredStatusChecks.exactHeadGate).toContainEqual({
      context: "Verify test-ledger contract",
      integrationId: "15368",
    });
    expect(plan.desiredRequiredStatusChecks.exactHeadGate).toContainEqual({
      context: "Typecheck",
      integrationId: null,
    });
  });

  it("replaces a same-named candidate check from the wrong producer", () => {
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

    const plan = planChiefProofModeRulesetMigration(input);
    expect(plan.desiredRequiredStatusChecks.exactHeadGate).toEqual([{
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: CHIEF_GOVERNANCE.candidateIntegrationId,
    }]);
  });

  it("returns no-change without manufacturing mutation authority when provider state already matches", () => {
    const input = pair();
    input.governanceBoundary = observe(rulesetReadback({
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "Verify operational authority", integration_id: 15368 }],
        },
      }],
    }));
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [],
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "Typecheck" },
            { context: "Verify test-ledger contract", integration_id: 15368 },
            { context: CHIEF_GOVERNANCE.candidateContext, integration_id: 15368 },
          ],
        },
      }],
    }));

    const plan = planChiefProofModeRulesetMigration(input);
    expect(plan.changesRequired).toBe(false);
    expect(plan.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(plan.authority.providerMutationAuthority).toBe(false);
  });

  it("fails closed when the authoritative candidate ruleset has a bypass actor", () => {
    const input = pair();
    input.exactHeadGate = observe(rulesetReadback({
      id: 20818149,
      name: "Chief AI main exact-head gate",
      bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
    }));

    expect(() => planChiefProofModeRulesetMigration(input)).toThrow(/zero bypass actors/);
  });

  it("fails closed when bypass state is not present in provider readback", () => {
    const readback = rulesetReadback();
    delete readback.bypass_actors;

    expect(() => observe(readback)).toThrow(/bypass actors must be provider-observed/);
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
