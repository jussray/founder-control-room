import { describe, expect, it } from "vitest";
import {
  ACTION_EVIDENCE,
  DEFAULT_ACTION_AUTHORITY_PROFILES,
  compileActionAuthorityProfiles,
  evaluateActionAuthority,
  type ActionAuthorityEvidence,
  type ActionAuthorityProfile,
} from "../repositoryActionAuthority.js";

const greenRepository: ActionAuthorityEvidence = {
  [ACTION_EVIDENCE.manifestValid]: "passed",
  [ACTION_EVIDENCE.requiredChecks]: "passed",
  [ACTION_EVIDENCE.noDrift]: "passed",
};

const greenUi: ActionAuthorityEvidence = {
  ...greenRepository,
  [ACTION_EVIDENCE.playwright]: "passed",
};

const greenIntegration: ActionAuthorityEvidence = {
  ...greenUi,
  [ACTION_EVIDENCE.exactHead]: "passed",
  [ACTION_EVIDENCE.independentReview]: "passed",
  [ACTION_EVIDENCE.freshBase]: "passed",
  [ACTION_EVIDENCE.providerEnforced]: "passed",
};

describe("repository action authority kernel", () => {
  it("allows repository inspection with only manifest validity", () => {
    expect(evaluateActionAuthority("inspect", {
      [ACTION_EVIDENCE.manifestValid]: "passed",
    })).toMatchObject({
      status: "allowed",
      reason: null,
    });
  });

  it("blocks patching when required repository proof is missing", () => {
    const decision = evaluateActionAuthority("patch", {
      [ACTION_EVIDENCE.manifestValid]: "passed",
      [ACTION_EVIDENCE.requiredChecks]: "passed",
    });

    expect(decision.status).toBe("blocked");
    expect(decision.missingEvidence).toContain(ACTION_EVIDENCE.noDrift);
  });

  it("requires Playwright before a UI change can earn authority", () => {
    const blocked = evaluateActionAuthority("ui-change", greenRepository);
    expect(blocked.status).toBe("blocked");
    expect(blocked.missingEvidence).toContain(ACTION_EVIDENCE.playwright);

    const allowed = evaluateActionAuthority("ui-change", greenUi);
    expect(allowed.status).toBe("allowed");
  });

  it("does not convert machine-green repository proof into integration authority", () => {
    const decision = evaluateActionAuthority("integrate", greenUi);

    expect(decision.status).toBe("blocked");
    expect(decision.missingEvidence).toEqual(expect.arrayContaining([
      ACTION_EVIDENCE.exactHead,
      ACTION_EVIDENCE.independentReview,
      ACTION_EVIDENCE.freshBase,
      ACTION_EVIDENCE.providerEnforced,
    ]));
  });

  it("allows integration only after exact provider authority evidence is satisfied", () => {
    expect(evaluateActionAuthority("integrate", greenIntegration).status).toBe("allowed");
  });

  it("requires immutable runtime identity and rollback before deploy authority", () => {
    const blocked = evaluateActionAuthority("deploy", greenIntegration);
    expect(blocked.status).toBe("blocked");
    expect(blocked.missingEvidence).toEqual(expect.arrayContaining([
      ACTION_EVIDENCE.immutableArtifact,
      ACTION_EVIDENCE.exactRuntimeSha,
      ACTION_EVIDENCE.rollbackReady,
    ]));

    const allowed = evaluateActionAuthority("deploy", {
      ...greenIntegration,
      [ACTION_EVIDENCE.immutableArtifact]: "passed",
      [ACTION_EVIDENCE.exactRuntimeSha]: "passed",
      [ACTION_EVIDENCE.rollbackReady]: "passed",
    });
    expect(allowed.status).toBe("allowed");
  });

  it("keeps high-consequence work behind exact founder receipt authority", () => {
    const blocked = evaluateActionAuthority("high-consequence", greenRepository);
    expect(blocked.status).toBe("blocked");
    expect(blocked.missingEvidence).toEqual(expect.arrayContaining([
      ACTION_EVIDENCE.founderReceipt,
      ACTION_EVIDENCE.founderExactScope,
      ACTION_EVIDENCE.founderNonReplay,
    ]));

    const allowed = evaluateActionAuthority("high-consequence", {
      ...greenRepository,
      [ACTION_EVIDENCE.founderReceipt]: "passed",
      [ACTION_EVIDENCE.founderExactScope]: "passed",
      [ACTION_EVIDENCE.founderNonReplay]: "passed",
    });
    expect(allowed.status).toBe("allowed");
  });

  it("returns pending rather than allowed when required evidence has not finished", () => {
    const decision = evaluateActionAuthority("ui-change", {
      ...greenRepository,
      [ACTION_EVIDENCE.playwright]: "pending",
    });

    expect(decision.status).toBe("pending");
    expect(decision.pendingEvidence).toEqual([ACTION_EVIDENCE.playwright]);
  });

  it("fails closed for undeclared actions and invalid profile graphs", () => {
    expect(evaluateActionAuthority("delete-production", greenIntegration)).toMatchObject({
      status: "blocked",
      reason: "authority_profile_undeclared",
    });

    const cyclic: ActionAuthorityProfile[] = [
      { action: "a", extends: ["b"], requiredEvidence: [] },
      { action: "b", extends: ["a"], requiredEvidence: [] },
    ];
    const invalid = evaluateActionAuthority("a", {}, cyclic);
    expect(invalid.status).toBe("blocked");
    expect(invalid.reason).toContain("profile_cycle");
  });

  it("keeps higher default actions monotonic by inheritance", () => {
    const compiled = compileActionAuthorityProfiles(DEFAULT_ACTION_AUTHORITY_PROFILES);
    const patch = new Set(compiled.get("patch"));
    const ui = new Set(compiled.get("ui-change"));
    const integrate = new Set(compiled.get("integrate"));
    const deploy = new Set(compiled.get("deploy"));

    for (const requirement of patch) expect(ui.has(requirement)).toBe(true);
    for (const requirement of ui) expect(integrate.has(requirement)).toBe(true);
    for (const requirement of integrate) expect(deploy.has(requirement)).toBe(true);
  });
});
