import { describe, expect, it, vi } from "vitest";
import {
  JUSSCO_RULESET_IDS,
  JUSSCO_RULESET_REPOSITORY,
  fingerprintJusscoRuleset,
  preflightJusscoRuleset,
} from "../jusscoRulesetPreflight.js";

function governanceReadback() {
  return {
    id: JUSSCO_RULESET_IDS.Governance,
    name: "Governance",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    bypass_actors: [],
    rules: [
      { type: "pull_request", parameters: { required_approving_review_count: 1 } },
      { type: "required_status_checks", parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          { context: "Independent Review Evidence", integration_id: 15368 },
          { context: "Juss & Co Site Browser Proof", integration_id: 15368 },
        ],
      } },
      { type: "non_fast_forward" },
      { type: "required_deployments", parameters: {
        required_deployment_environments: ["production-verification"],
      } },
    ],
  };
}

function productionReadback() {
  return {
    id: JUSSCO_RULESET_IDS.Production,
    name: "Production",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: [
      "~ALL", "refs/heads/main", "refs/heads/Production",
      "refs/heads/releases", "refs/heads/Deployed",
    ], exclude: [] } },
    bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
    rules: [
      { type: "pull_request", parameters: { required_approving_review_count: 1 } },
      { type: "required_status_checks", parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [],
      } },
      { type: "required_deployments", parameters: {
        required_deployment_environments: ["current-production-gate"],
      } },
    ],
  };
}

function provider(readback: unknown) {
  return {
    getRepoRuleset: vi.fn().mockResolvedValue(readback),
    updateRepoRuleset: vi.fn().mockResolvedValue({ changed: true }),
    createRepoRuleset: vi.fn().mockResolvedValue({ created: true }),
  };
}

describe("FCR jussray/jussray ruleset preflight: fail closed", () => {
  it("rejects unrelated repositories and rule IDs before any provider access", async () => {
    const readback = governanceReadback();
    const api = provider(readback);
    const expectedFingerprint = fingerprintJusscoRuleset(readback);
    await expect(preflightJusscoRuleset({
      repository: "jussray/chief-ai-machine", rulesetId: readback.id,
      expectedFingerprint, provider: api,
    })).rejects.toThrow(/UNAUTHORIZED_REPOSITORY/);
    await expect(preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: 999999,
      expectedFingerprint, provider: api,
    })).rejects.toThrow(/UNAUTHORIZED_RULESET_ID/);
    expect(api.getRepoRuleset).not.toHaveBeenCalled();
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
    expect(api.createRepoRuleset).not.toHaveBeenCalled();
  });

  it("rejects stale fingerprints without attempting any write", async () => {
    const readback = governanceReadback();
    const api = provider(readback);
    await expect(preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: readback.id,
      expectedFingerprint: "a".repeat(64), provider: api,
    })).rejects.toThrow(/STALE_RULESET_OBSERVATION/);
    expect(api.getRepoRuleset).toHaveBeenCalledTimes(1);
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
  });

  it("rejects weakened human review, main exclusions and incomplete readback", async () => {
    for (const variant of ["review", "exclude", "incomplete"] as const) {
      const readback = governanceReadback() as Record<string, any>;
      if (variant === "review") readback.rules[0].parameters.required_approving_review_count = 0;
      if (variant === "exclude") readback.conditions.ref_name.exclude = ["refs/heads/main"];
      if (variant === "incomplete") delete readback.bypass_actors;
      const api = provider(readback);
      await expect(preflightJusscoRuleset({
        repository: JUSSCO_RULESET_REPOSITORY, rulesetId: JUSSCO_RULESET_IDS.Governance,
        expectedFingerprint: fingerprintJusscoRuleset(readback), provider: api,
      })).rejects.toThrow();
      expect(api.updateRepoRuleset).not.toHaveBeenCalled();
    }
  });

  it("proposes only advisory Governance repairs while preserving checks, review and deployment count", async () => {
    const readback = governanceReadback();
    const api = provider(readback);
    const plan = await preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: readback.id,
      expectedFingerprint: fingerprintJusscoRuleset(readback), provider: api,
    });
    expect(plan.rulesetName).toBe("Governance");
    expect(plan.disposition).toBe("BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE");
    expect(plan.gaps).toEqual([
      "Enable strict required-status freshness",
      "Bind Review Gate Unit Tests to verified GitHub Actions producer 15368",
    ]);
    expect(plan.observedChecks).toContain("Independent Review Evidence");
    expect(plan.observedDeploymentCount).toBe(1);
    expect(plan.providerMutationPerformed).toBe(false);
    expect(plan.mutationAuthorized).toBe(false);
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
  });

  it("proposes only advisory Production scope and force-push repairs, retaining bypasses", async () => {
    const readback = productionReadback();
    const api = provider(readback);
    const plan = await preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: readback.id,
      expectedFingerprint: fingerprintJusscoRuleset(readback), provider: api,
    });
    expect(plan.gaps).toContain(
      "Constrain Production scope to the four protected branches; review unknown refs before removal",
    );
    expect(plan.gaps).toContain("Add force-push prevention");
    expect(plan.observedBypassCount).toBe(1);
    expect(plan.observedDeploymentCount).toBe(1);
    expect(plan.suggestedReview).toContain("Review existing bypass actors separately; do not silently replace them");
    expect(plan.mergeAuthorized).toBe(false);
    expect(plan.deployAuthorized).toBe(false);
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
  });

  it("does not fabricate work for a verified already-correct Governance ruleset", async () => {
    const readback = governanceReadback();
    const check = (readback.rules[1] as Record<string, any>).parameters;
    check.strict_required_status_checks_policy = true;
    check.required_status_checks.push({ context: "Review Gate Unit Tests", integration_id: 15368 });
    const api = provider(readback);
    const plan = await preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: readback.id,
      expectedFingerprint: fingerprintJusscoRuleset(readback), provider: api,
    });
    expect(plan.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(plan.gaps).toEqual([]);
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
  });

  it("fails closed on duplicate checks instead of manufacturing a new ruleset", async () => {
    const readback = governanceReadback();
    const status = (readback.rules[1] as Record<string, any>).parameters;
    status.required_status_checks.push({ context: "Independent Review Evidence", integration_id: 15368 });
    const api = provider(readback);
    await expect(preflightJusscoRuleset({
      repository: JUSSCO_RULESET_REPOSITORY, rulesetId: readback.id,
      expectedFingerprint: fingerprintJusscoRuleset(readback), provider: api,
    })).rejects.toThrow(/DUPLICATE_REQUIRED_CHECK_CONTEXT/);
    expect(api.createRepoRuleset).not.toHaveBeenCalled();
    expect(api.updateRepoRuleset).not.toHaveBeenCalled();
  });
});
