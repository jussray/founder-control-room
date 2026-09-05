import { createHash } from "node:crypto";

export const GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT =
  "fcr/github-governance-reconciliation@v1" as const;

export const CHIEF_GOVERNANCE = Object.freeze({
  repository: "jussray/chief-ai-machine",
  protectedBranch: "main",
  exactHeadRulesetId: "20818149",
  exactHeadRulesetName: "Chief AI main exact-head gate",
  governanceBoundaryRulesetId: "21261587",
  governanceBoundaryRulesetName: "governance boundary",
  candidateContext: "Verify candidate ProofMode runtime with Playwright",
  candidateIntegrationId: null,
  candidateProducerTrust: "external-github-app-check-required",
  legacyPreMergeContexts: [
    "Verify live ProofMode MCP with Playwright",
    "Verify production ProofMode MCP with Playwright",
  ],
} as const);

export type GithubRulesetMutationDisposition =
  | "NO_CHANGE_REQUIRED"
  | "BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE";

export interface GithubRequiredStatusCheck {
  context: string;
  integrationId: string | null;
}

export interface GithubBypassActorObservation {
  actorType: string;
  actorId: string;
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

export interface ChiefProofModeRulesetMigrationPlan {
  contract: typeof GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT;
  repository: typeof CHIEF_GOVERNANCE.repository;
  beforeFingerprints: {
    governanceBoundary: string;
    exactHeadGate: string;
  };
  desiredRequiredStatusChecks: {
    governanceBoundary: GithubRequiredStatusCheck[];
    exactHeadGate: GithubRequiredStatusCheck[];
  };
  changesRequired: boolean;
  disposition: GithubRulesetMutationDisposition;
  atomicProviderPreconditionRequired: true;
  atomicProviderPreconditionAvailable: false;
  authority: {
    observationOnly: true;
    providerMutationAuthority: false;
    mergeAuthority: false;
    deployAuthority: false;
  };
}

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

function requiredStatusChecks(readback: JsonObject): GithubRequiredStatusCheck[] {
  const rules = requireArray(readback.rules, "ruleset rules");
  const statusRules = rules.filter(
    (rule) => isObject(rule) && cleanText(rule.type) === "required_status_checks",
  );
  if (statusRules.length > 1) {
    throw new Error("ruleset must not contain duplicate required_status_checks rules");
  }
  if (statusRules.length === 0) return [];

  const parameters = isObject((statusRules[0] as JsonObject).parameters)
    ? ((statusRules[0] as JsonObject).parameters as JsonObject)
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

function bypassActors(readback: JsonObject): GithubBypassActorObservation[] {
  const actors = requireArray(readback.bypass_actors, "ruleset bypass actors");
  return actors.map((actor) => {
    if (!isObject(actor)) throw new Error("ruleset bypass actor entries must be objects");
    const actorType = cleanText(actor.actor_type);
    const actorId = cleanId(actor.actor_id);
    const bypassMode = cleanText(actor.bypass_mode);
    if (!actorType || !actorId || !bypassMode) {
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

function sameChecks(left: GithubRequiredStatusCheck[], right: GithubRequiredStatusCheck[]): boolean {
  const normalize = (checks: GithubRequiredStatusCheck[]) => [...checks]
    .sort((a, b) => a.context.localeCompare(b.context))
    .map((check) => `${check.context}\u0000${check.integrationId ?? ""}`);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
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
  if (exactHeadGate.bypassActors.length !== 0) {
    throw new Error("Chief exact-head candidate ruleset must have zero bypass actors");
  }

  const candidateIntegrationId = cleanId(CHIEF_GOVERNANCE.candidateIntegrationId);
  if (!candidateIntegrationId || candidateIntegrationId === "15368") {
    throw new Error(
      "Chief candidate ProofMode external check producer integration is not yet observed; refusing to plan a GitHub Actions-only required check",
    );
  }

  const legacy = new Set<string>(CHIEF_GOVERNANCE.legacyPreMergeContexts);
  const governanceDesired = governanceBoundary.requiredStatusChecks.filter(
    (check) => !legacy.has(check.context) && check.context !== CHIEF_GOVERNANCE.candidateContext,
  );
  const exactHeadDesired = exactHeadGate.requiredStatusChecks
    .filter((check) => check.context !== CHIEF_GOVERNANCE.candidateContext)
    .concat({
      context: CHIEF_GOVERNANCE.candidateContext,
      integrationId: candidateIntegrationId,
    });

  const changesRequired = !sameChecks(governanceBoundary.requiredStatusChecks, governanceDesired)
    || !sameChecks(exactHeadGate.requiredStatusChecks, exactHeadDesired);

  return {
    contract: GITHUB_GOVERNANCE_RECONCILIATION_CONTRACT,
    repository: CHIEF_GOVERNANCE.repository,
    beforeFingerprints: {
      governanceBoundary: governanceBoundary.providerFingerprint,
      exactHeadGate: exactHeadGate.providerFingerprint,
    },
    desiredRequiredStatusChecks: {
      governanceBoundary: governanceDesired,
      exactHeadGate: exactHeadDesired,
    },
    changesRequired,
    disposition: changesRequired
      ? "BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE"
      : "NO_CHANGE_REQUIRED",
    atomicProviderPreconditionRequired: true,
    atomicProviderPreconditionAvailable: false,
    authority: {
      observationOnly: true,
      providerMutationAuthority: false,
      mergeAuthority: false,
      deployAuthority: false,
    },
  };
}
