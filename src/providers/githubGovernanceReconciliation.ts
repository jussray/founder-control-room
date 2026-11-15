import { createHash } from "node:crypto";

export const GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT =
  "fcr/github-governance-reconciliation@v1" as const;

const GITHUB_ACTIONS_APP_ID = "15368" as const;

export const CHIEF_GOVERNANCE = Object.freeze({
  repository: "jussray/chief-ai-machine",
  protectedBranch: "main",
  exactHeadRulesetId: "20818149",
  exactHeadRulesetName: "Chief AI main exact-head gate",
  governanceBoundaryRulesetId: "21261587",
  governanceBoundaryRulesetName: "governance boundary",
  candidateContext: "Verify candidate ProofMode runtime with Playwright",
  candidateIntegrationId: GITHUB_ACTIONS_APP_ID,
  candidateProducerTrust: "github-actions-integration-bound",
  governanceBoundaryStableContexts: [
    "Typecheck",
    "Verify operational authority",
  ],
  postMergeProductionProofEnvironments: [
    "Cloudflare Production",
    "proofmode-access-admin",
  ],
} as const);

export type GithubRulesetMutationDisposition =
  | "NO_CHANGE_REQUIRED"
  | "MUTATION_REQUIRED";

export interface GithubRequiredStatusCheck {
  context: string;
  integrationId: string | null;
}

export interface GithubBypassActorObservation {
  actorType: string;
  actorId: string | null;
  bypassMode: string;
}

export interface TrustedGithubRulesetObservation {
  contract: typeof GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT;
  repository: string;
  rulesetId: string;
  rulesetName: string;
  target: string;
  enforcement: string;
  includedRefs: string[];
  excludedRefs: string[];
  requiredStatusChecks: GithubRequiredStatusCheck[];
  requiredStatusChecksStrict: boolean;
  requiredDeploymentEnvironments: string[];
  bypassActors: GithubBypassActorObservation[];
  providerFingerprint: string;
  observedAt: string;
  observer: {
    kind: "github-app";
    appId: string;
  };
  authority: {
    observationOnly: true;
    providerMutationAuthority: false;
    mergeAuthority: false;
    deployAuthority: false;
  };
}

export interface ChiefRulesetDesiredState {
  rulesetId: string;
  rulesetName: string;
  expectedProviderFingerprint: string;
  desiredRequiredStatusChecks: GithubRequiredStatusCheck[];
  desiredRequiredDeploymentEnvironments: string[];
  desiredBypassActors: GithubBypassActorObservation[];
  requireStrictStatusFreshness: true;
  preserveUnmanagedRules: true;
  changes: {
    statusChecks: {
      added: GithubRequiredStatusCheck[];
      removed: GithubRequiredStatusCheck[];
      retained: GithubRequiredStatusCheck[];
    };
    requiredDeploymentEnvironments: {
      added: string[];
      removed: string[];
      retained: string[];
    };
    bypassActors: {
      removed: GithubBypassActorObservation[];
    };
    strictStatusFreshness: {
      from: boolean;
      to: true;
    };
  };
}

export interface ChiefProofModeRulesetVerification {
  contract: typeof GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT;
  repository: typeof CHIEF_GOVERNANCE.repository;
  observedFingerprints: {
    governanceBoundary: string;
    exactHeadGate: string;
  };
  observedRequiredStatusChecks: {
    governanceBoundary: GithubRequiredStatusCheck[];
    exactHeadGate: GithubRequiredStatusCheck[];
  };
  observedRequiredDeploymentEnvironments: {
    governanceBoundary: string[];
    exactHeadGate: string[];
  };
  changesRequired: boolean;
  disposition: GithubRulesetMutationDisposition;
  mutationRequired: boolean;
  mutation: null | {
    governanceBoundary: ChiefRulesetDesiredState;
    exactHeadGate: ChiefRulesetDesiredState;
    executionAuthorized: false;
    requiresFreshProviderReadback: true;
  };
  candidateProducer: {
    context: typeof CHIEF_GOVERNANCE.candidateContext;
    integrationId: typeof CHIEF_GOVERNANCE.candidateIntegrationId;
    trust: typeof CHIEF_GOVERNANCE.candidateProducerTrust;
    requiredByRuleset: true;
    carrierRulesetId: typeof CHIEF_GOVERNANCE.exactHeadRulesetId;
  };
  postMergeProductionProof: {
    requiredDeploymentEnvironments: string[];
    preMergeRequired: false;
    truthPlane: "post-merge-current-main";
  };
  authority: {
    observationOnly: true;
    providerMutationAuthority: false;
    mergeAuthority: false;
    deployAuthority: false;
  };
}

export type ChiefProofModeRulesetMigrationPlan = ChiefProofModeRulesetVerification;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanId(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be provider-observed`);
  return value;
}

function requiredStatusRule(readback: JsonObject): JsonObject | null {
  const rules = requireArray(readback.rules, "ruleset rules");
  const statusRules = rules.filter(
    (rule) => isObject(rule) && cleanText(rule.type) === "required_status_checks",
  );
  if (statusRules.length > 1) {
    throw new Error("ruleset must not contain duplicate required_status_checks rules");
  }
  return statusRules.length === 0 ? null : statusRules[0] as JsonObject;
}

function requiredStatusChecks(readback: JsonObject): GithubRequiredStatusCheck[] {
  const statusRule = requiredStatusRule(readback);
  if (!statusRule) return [];
  const parameters = isObject(statusRule.parameters)
    ? statusRule.parameters as JsonObject
    : {};
  const entries = requireArray(parameters.required_status_checks, "required status checks");
  const seen = new Set<string>();
  return entries.map((entry) => {
    if (!isObject(entry)) throw new Error("required status check entries must be objects");
    const context = cleanText(entry.context);
    if (!context) throw new Error("required status check context is required");
    if (seen.has(context)) throw new Error(`duplicate required status check context: ${context}`);
    seen.add(context);
    const integrationId = entry.integration_id == null ? null : cleanId(entry.integration_id);
    if (entry.integration_id != null && !integrationId) {
      throw new Error(`required status check ${context} has invalid integration_id`);
    }
    return { context, integrationId };
  });
}

function requiredStatusChecksStrict(readback: JsonObject): boolean {
  const statusRule = requiredStatusRule(readback);
  if (!statusRule) return false;
  const parameters = isObject(statusRule.parameters)
    ? statusRule.parameters as JsonObject
    : {};
  return parameters.strict_required_status_checks_policy === true;
}

function requiredDeploymentEnvironments(readback: JsonObject): string[] {
  const rules = requireArray(readback.rules, "ruleset rules");
  const deploymentRules = rules.filter(
    (rule) => isObject(rule) && cleanText(rule.type) === "required_deployments",
  );
  if (deploymentRules.length > 1) {
    throw new Error("ruleset must not contain duplicate required_deployments rules");
  }
  if (deploymentRules.length === 0) return [];

  const parameters = isObject((deploymentRules[0] as JsonObject).parameters)
    ? (deploymentRules[0] as JsonObject).parameters as JsonObject
    : {};
  const environments = requireArray(
    parameters.required_deployment_environments,
    "required deployment environments",
  ).map(cleanText).filter(Boolean);
  return [...new Set(environments)];
}

function bypassActors(readback: JsonObject): GithubBypassActorObservation[] {
  const actors = requireArray(readback.bypass_actors, "ruleset bypass actors");
  return actors.map((actor) => {
    if (!isObject(actor)) throw new Error("ruleset bypass actor entries must be objects");
    const actorType = cleanText(actor.actor_type);
    const rawActorId = actor.actor_id;
    const actorId = rawActorId == null ? null : cleanId(rawActorId);
    const bypassMode = cleanText(actor.bypass_mode);
    if (!actorType || (rawActorId != null && !actorId) || !bypassMode) {
      throw new Error("ruleset bypass actor identity must be complete");
    }
    return { actorType, actorId, bypassMode };
  });
}

function refs(readback: JsonObject, key: "include" | "exclude"): string[] {
  const conditions = isObject(readback.conditions) ? readback.conditions : {};
  const refName = isObject(conditions.ref_name) ? conditions.ref_name : {};
  return requireArray(refName[key], `ruleset ref ${key}`)
    .map(cleanText)
    .filter(Boolean);
}

export function createTrustedGithubRulesetObservation(input: {
  repository: string;
  rulesetId: string | number;
  readback: unknown;
  observerAppId: string | number;
  observedAt: string;
}): TrustedGithubRulesetObservation {
  const repository = cleanText(input.repository);
  if (repository !== CHIEF_GOVERNANCE.repository) {
    throw new Error(`trusted governance observation is pinned to ${CHIEF_GOVERNANCE.repository}`);
  }
  const rulesetId = cleanId(input.rulesetId);
  const observerAppId = cleanId(input.observerAppId);
  if (!rulesetId) throw new Error("trusted governance observation requires a numeric ruleset id");
  if (!observerAppId) throw new Error("trusted governance observation requires a numeric GitHub App observer id");
  if (!input.observedAt || Number.isNaN(Date.parse(input.observedAt))) {
    throw new Error("trusted governance observation requires a valid observedAt timestamp");
  }
  if (!isObject(input.readback)) throw new Error("trusted governance observation requires provider readback");

  const providerRulesetId = cleanId(input.readback.id);
  if (providerRulesetId !== rulesetId) {
    throw new Error(`provider ruleset id mismatch: expected ${rulesetId}, observed ${providerRulesetId || "missing"}`);
  }
  const rulesetName = cleanText(input.readback.name);
  const target = cleanText(input.readback.target);
  const enforcement = cleanText(input.readback.enforcement);
  if (!rulesetName || !target || !enforcement) {
    throw new Error("provider ruleset identity is incomplete");
  }

  return {
    contract: GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT,
    repository,
    rulesetId,
    rulesetName,
    target,
    enforcement,
    includedRefs: refs(input.readback, "include"),
    excludedRefs: refs(input.readback, "exclude"),
    requiredStatusChecks: requiredStatusChecks(input.readback),
    requiredStatusChecksStrict: requiredStatusChecksStrict(input.readback),
    requiredDeploymentEnvironments: requiredDeploymentEnvironments(input.readback),
    bypassActors: bypassActors(input.readback),
    providerFingerprint: sha256(input.readback),
    observedAt: new Date(input.observedAt).toISOString(),
    observer: { kind: "github-app", appId: observerAppId },
    authority: {
      observationOnly: true,
      providerMutationAuthority: false,
      mergeAuthority: false,
      deployAuthority: false,
    },
  };
}

function requireChiefRuleset(
  observation: TrustedGithubRulesetObservation,
  id: string,
  name: string,
): void {
  if (observation.repository !== CHIEF_GOVERNANCE.repository) throw new Error("Chief governance repository drifted");
  if (observation.rulesetId !== id) throw new Error(`Chief governance ruleset id drifted: expected ${id}`);
  if (observation.rulesetName !== name) throw new Error(`Chief governance ruleset name drifted: expected ${name}`);
  if (observation.target !== "branch") throw new Error(`${name} must target branches`);
  if (observation.enforcement !== "active") throw new Error(`${name} must remain active`);
  const coversMain = observation.includedRefs.includes("refs/heads/main")
    || observation.includedRefs.includes("~DEFAULT_BRANCH")
    || observation.includedRefs.includes("~ALL");
  if (!coversMain) throw new Error(`${name} does not cover main`);
  if (observation.excludedRefs.includes("refs/heads/main") || observation.excludedRefs.includes("~ALL")) {
    throw new Error(`${name} excludes main`);
  }
}

function checkKey(check: GithubRequiredStatusCheck): string {
  return `${check.context}\u0000${check.integrationId ?? ""}`;
}

function sameChecks(left: readonly GithubRequiredStatusCheck[], right: readonly GithubRequiredStatusCheck[]): boolean {
  return JSON.stringify([...left].map(checkKey).sort()) === JSON.stringify([...right].map(checkKey).sort());
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function sameActors(left: readonly GithubBypassActorObservation[], right: readonly GithubBypassActorObservation[]): boolean {
  return stableJson(left) === stableJson(right);
}

function statusCheckDelta(
  observed: readonly GithubRequiredStatusCheck[],
  desired: readonly GithubRequiredStatusCheck[],
): ChiefRulesetDesiredState["changes"]["statusChecks"] {
  const observedKeys = new Set(observed.map(checkKey));
  const desiredKeys = new Set(desired.map(checkKey));
  return {
    added: desired.filter((check) => !observedKeys.has(checkKey(check))).map((check) => ({ ...check })),
    removed: observed.filter((check) => !desiredKeys.has(checkKey(check))).map((check) => ({ ...check })),
    retained: desired.filter((check) => observedKeys.has(checkKey(check))).map((check) => ({ ...check })),
  };
}

function stringDelta(observed: readonly string[], desired: readonly string[]) {
  const observedSet = new Set(observed);
  const desiredSet = new Set(desired);
  return {
    added: desired.filter((value) => !observedSet.has(value)),
    removed: observed.filter((value) => !desiredSet.has(value)),
    retained: desired.filter((value) => observedSet.has(value)),
  };
}

function desiredGovernanceBoundaryChecks(): GithubRequiredStatusCheck[] {
  return CHIEF_GOVERNANCE.governanceBoundaryStableContexts.map((context) => ({
    context,
    integrationId: GITHUB_ACTIONS_APP_ID,
  }));
}

function desiredExactHeadChecks(
  observed: readonly GithubRequiredStatusCheck[],
): GithubRequiredStatusCheck[] {
  const preserved = observed.filter((check) => (
    check.context !== CHIEF_GOVERNANCE.candidateContext
    && check.context !== "Verify production ProofMode MCP with Playwright"
  ));
  return [
    ...preserved.map((check) => ({ ...check })),
    {
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: CHIEF_GOVERNANCE.candidateIntegrationId,
    },
  ];
}

function desiredState(
  observation: TrustedGithubRulesetObservation,
  desiredRequiredStatusChecks: GithubRequiredStatusCheck[],
): ChiefRulesetDesiredState {
  const desiredRequiredDeploymentEnvironments: string[] = [];
  const desiredBypassActors: GithubBypassActorObservation[] = [];
  return {
    rulesetId: observation.rulesetId,
    rulesetName: observation.rulesetName,
    expectedProviderFingerprint: observation.providerFingerprint,
    desiredRequiredStatusChecks: desiredRequiredStatusChecks.map((check) => ({ ...check })),
    desiredRequiredDeploymentEnvironments,
    desiredBypassActors,
    requireStrictStatusFreshness: true,
    preserveUnmanagedRules: true,
    changes: {
      statusChecks: statusCheckDelta(observation.requiredStatusChecks, desiredRequiredStatusChecks),
      requiredDeploymentEnvironments: stringDelta(
        observation.requiredDeploymentEnvironments,
        desiredRequiredDeploymentEnvironments,
      ),
      bypassActors: {
        removed: observation.bypassActors.map((actor) => ({ ...actor })),
      },
      strictStatusFreshness: {
        from: observation.requiredStatusChecksStrict,
        to: true,
      },
    },
  };
}

function stateMatchesObservation(
  observation: TrustedGithubRulesetObservation,
  desired: ChiefRulesetDesiredState,
): boolean {
  return observation.requiredStatusChecksStrict
    && sameChecks(observation.requiredStatusChecks, desired.desiredRequiredStatusChecks)
    && sameStrings(
      observation.requiredDeploymentEnvironments,
      desired.desiredRequiredDeploymentEnvironments,
    )
    && sameActors(observation.bypassActors, desired.desiredBypassActors);
}

/**
 * Plans the founder-approved producer-correct Chief governance topology from
 * complete trusted provider observations. This is evidence and desired-state
 * planning only: it never executes a ruleset mutation or grants merge/deploy
 * authority.
 *
 * Candidate-head proof belongs on the no-bypass exact-head carrier and is
 * bound to GitHub Actions integration 15368. Production deployment evidence is
 * removed from the pre-merge membrane but remains an explicit post-merge truth
 * obligation.
 */
export function planChiefProofModeRulesetMigration(input: {
  governanceBoundary: TrustedGithubRulesetObservation;
  exactHeadGate: TrustedGithubRulesetObservation;
}): ChiefProofModeRulesetMigrationPlan {
  const { governanceBoundary, exactHeadGate } = input;
  requireChiefRuleset(
    governanceBoundary,
    CHIEF_GOVERNANCE.governanceBoundaryRulesetId,
    CHIEF_GOVERNANCE.governanceBoundaryRulesetName,
  );
  requireChiefRuleset(
    exactHeadGate,
    CHIEF_GOVERNANCE.exactHeadRulesetId,
    CHIEF_GOVERNANCE.exactHeadRulesetName,
  );
  if (governanceBoundary.observer.appId !== exactHeadGate.observer.appId) {
    throw new Error("Chief governance observations must come from the same trusted GitHub App observer");
  }

  const governanceBoundaryDesired = desiredState(
    governanceBoundary,
    desiredGovernanceBoundaryChecks(),
  );
  const exactHeadDesired = desiredState(
    exactHeadGate,
    desiredExactHeadChecks(exactHeadGate.requiredStatusChecks),
  );
  const governanceMatches = stateMatchesObservation(
    governanceBoundary,
    governanceBoundaryDesired,
  );
  const exactHeadMatches = stateMatchesObservation(exactHeadGate, exactHeadDesired);
  const changesRequired = !governanceMatches || !exactHeadMatches;

  return {
    contract: GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT,
    repository: CHIEF_GOVERNANCE.repository,
    observedFingerprints: {
      governanceBoundary: governanceBoundary.providerFingerprint,
      exactHeadGate: exactHeadGate.providerFingerprint,
    },
    observedRequiredStatusChecks: {
      governanceBoundary: [...governanceBoundary.requiredStatusChecks],
      exactHeadGate: [...exactHeadGate.requiredStatusChecks],
    },
    observedRequiredDeploymentEnvironments: {
      governanceBoundary: [...governanceBoundary.requiredDeploymentEnvironments],
      exactHeadGate: [...exactHeadGate.requiredDeploymentEnvironments],
    },
    changesRequired,
    disposition: changesRequired ? "MUTATION_REQUIRED" : "NO_CHANGE_REQUIRED",
    mutationRequired: changesRequired,
    mutation: changesRequired ? {
      governanceBoundary: governanceBoundaryDesired,
      exactHeadGate: exactHeadDesired,
      executionAuthorized: false,
      requiresFreshProviderReadback: true,
    } : null,
    candidateProducer: {
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: CHIEF_GOVERNANCE.candidateIntegrationId,
      trust: CHIEF_GOVERNANCE.candidateProducerTrust,
      requiredByRuleset: true,
      carrierRulesetId: CHIEF_GOVERNANCE.exactHeadRulesetId,
    },
    postMergeProductionProof: {
      requiredDeploymentEnvironments: [...CHIEF_GOVERNANCE.postMergeProductionProofEnvironments],
      preMergeRequired: false,
      truthPlane: "post-merge-current-main",
    },
    authority: {
      observationOnly: true,
      providerMutationAuthority: false,
      mergeAuthority: false,
      deployAuthority: false,
    },
  };
}

/**
 * @deprecated Compatibility name retained for callers. The September 13
 * founder decision superseded the former as-is topology; this now returns the
 * same non-authorizing reconciliation plan as planChiefProofModeRulesetMigration.
 */
export function verifyChiefProofModeRulesetsAsIs(input: {
  governanceBoundary: TrustedGithubRulesetObservation;
  exactHeadGate: TrustedGithubRulesetObservation;
}): ChiefProofModeRulesetVerification {
  return planChiefProofModeRulesetMigration(input);
}
