export type ActionAuthorityStatus = "allowed" | "blocked" | "pending";
export type ActionEvidenceStatus = "passed" | "failed" | "pending" | "missing";

export interface ActionAuthorityProfile {
  action: string;
  extends?: string[];
  requiredEvidence: string[];
}

export interface ActionAuthorityDecision {
  action: string;
  status: ActionAuthorityStatus;
  requiredEvidence: string[];
  failedEvidence: string[];
  pendingEvidence: string[];
  missingEvidence: string[];
  reason: string | null;
}

export type ActionAuthorityEvidence = Readonly<Record<string, ActionEvidenceStatus>>;

export const ACTION_EVIDENCE = {
  manifestValid: "repository:manifest-valid",
  requiredChecks: "repository:required-checks",
  noDrift: "repository:no-drift",
  playwright: "browser:playwright",
  exactHead: "provider:exact-head",
  independentReview: "provider:independent-review",
  freshBase: "provider:fresh-base",
  providerEnforced: "provider:enforced",
  immutableArtifact: "runtime:immutable-artifact",
  exactRuntimeSha: "runtime:exact-sha",
  rollbackReady: "runtime:rollback-ready",
  founderReceipt: "founder:receipt",
  founderExactScope: "founder:exact-scope",
  founderNonReplay: "founder:non-replay",
} as const;

/**
 * Canonical FCR evidence floors. A repository may later add stricter evidence,
 * but these floors define what repository verification alone is never allowed
 * to silently skip for increasingly privileged actions.
 */
export const DEFAULT_ACTION_AUTHORITY_PROFILES: readonly ActionAuthorityProfile[] = [
  {
    action: "inspect",
    requiredEvidence: [ACTION_EVIDENCE.manifestValid],
  },
  {
    action: "patch",
    extends: ["inspect"],
    requiredEvidence: [
      ACTION_EVIDENCE.requiredChecks,
      ACTION_EVIDENCE.noDrift,
    ],
  },
  {
    action: "ui-change",
    extends: ["patch"],
    requiredEvidence: [ACTION_EVIDENCE.playwright],
  },
  {
    action: "integrate",
    extends: ["ui-change"],
    requiredEvidence: [
      ACTION_EVIDENCE.exactHead,
      ACTION_EVIDENCE.independentReview,
      ACTION_EVIDENCE.freshBase,
      ACTION_EVIDENCE.providerEnforced,
    ],
  },
  {
    action: "deploy",
    extends: ["integrate"],
    requiredEvidence: [
      ACTION_EVIDENCE.immutableArtifact,
      ACTION_EVIDENCE.exactRuntimeSha,
      ACTION_EVIDENCE.rollbackReady,
    ],
  },
  {
    action: "high-consequence",
    extends: ["patch"],
    requiredEvidence: [
      ACTION_EVIDENCE.founderReceipt,
      ACTION_EVIDENCE.founderExactScope,
      ACTION_EVIDENCE.founderNonReplay,
    ],
  },
] as const;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field}_empty`);
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field}_duplicates`);
}

function profileMap(
  profiles: readonly ActionAuthorityProfile[],
): Map<string, ActionAuthorityProfile> {
  const result = new Map<string, ActionAuthorityProfile>();
  for (const profile of profiles) {
    assertNonEmpty(profile.action, "action");
    assertUnique(profile.requiredEvidence, `required_evidence_${profile.action}`);
    assertUnique(profile.extends ?? [], `extends_${profile.action}`);
    for (const evidence of profile.requiredEvidence) {
      assertNonEmpty(evidence, `evidence_${profile.action}`);
    }
    for (const parent of profile.extends ?? []) {
      assertNonEmpty(parent, `extends_${profile.action}`);
      if (parent === profile.action) throw new Error(`profile_self_cycle:${profile.action}`);
    }
    if (result.has(profile.action)) throw new Error(`duplicate_profile:${profile.action}`);
    result.set(profile.action, profile);
  }
  return result;
}

export function compileActionAuthorityProfiles(
  profiles: readonly ActionAuthorityProfile[] = DEFAULT_ACTION_AUTHORITY_PROFILES,
): ReadonlyMap<string, readonly string[]> {
  const byAction = profileMap(profiles);
  const compiled = new Map<string, readonly string[]>();
  const visiting = new Set<string>();

  const resolve = (action: string): readonly string[] => {
    const cached = compiled.get(action);
    if (cached) return cached;
    const profile = byAction.get(action);
    if (!profile) throw new Error(`unknown_profile:${action}`);
    if (visiting.has(action)) throw new Error(`profile_cycle:${action}`);

    visiting.add(action);
    const requirements = new Set<string>();
    for (const parent of profile.extends ?? []) {
      for (const requirement of resolve(parent)) requirements.add(requirement);
    }
    for (const requirement of profile.requiredEvidence) requirements.add(requirement);
    visiting.delete(action);

    const resolved = [...requirements];
    compiled.set(action, resolved);
    return resolved;
  };

  for (const action of byAction.keys()) resolve(action);
  return compiled;
}

export function evaluateActionAuthority(
  action: string,
  evidence: ActionAuthorityEvidence,
  profiles: readonly ActionAuthorityProfile[] = DEFAULT_ACTION_AUTHORITY_PROFILES,
): ActionAuthorityDecision {
  let compiled: ReadonlyMap<string, readonly string[]>;
  try {
    compiled = compileActionAuthorityProfiles(profiles);
  } catch (error) {
    return {
      action,
      status: "blocked",
      requiredEvidence: [],
      failedEvidence: [],
      pendingEvidence: [],
      missingEvidence: [],
      reason: `authority_profile_invalid:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const requirements = compiled.get(action);
  if (!requirements) {
    return {
      action,
      status: "blocked",
      requiredEvidence: [],
      failedEvidence: [],
      pendingEvidence: [],
      missingEvidence: [],
      reason: "authority_profile_undeclared",
    };
  }

  const failedEvidence = requirements.filter((id) => evidence[id] === "failed");
  const pendingEvidence = requirements.filter((id) => evidence[id] === "pending");
  const missingEvidence = requirements.filter(
    (id) => evidence[id] === undefined || evidence[id] === "missing",
  );

  if (failedEvidence.length > 0 || missingEvidence.length > 0) {
    return {
      action,
      status: "blocked",
      requiredEvidence: [...requirements],
      failedEvidence,
      pendingEvidence,
      missingEvidence,
      reason: "required_evidence_not_satisfied",
    };
  }

  if (pendingEvidence.length > 0) {
    return {
      action,
      status: "pending",
      requiredEvidence: [...requirements],
      failedEvidence,
      pendingEvidence,
      missingEvidence,
      reason: "required_evidence_pending",
    };
  }

  return {
    action,
    status: "allowed",
    requiredEvidence: [...requirements],
    failedEvidence: [],
    pendingEvidence: [],
    missingEvidence: [],
    reason: null,
  };
}
