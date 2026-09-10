import { createHash } from "node:crypto";

export interface RulesetRuleLike {
  type?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MergeExistingRulesetSecurityInput {
  existingRules: RulesetRuleLike[];
  requestedRules: RulesetRuleLike[];
  requiredStatusCheckNames: string[];
  requirePullRequest: boolean;
  blockForcePushes: boolean;
  blockDeletion: boolean;
}

export interface RulesetReconciliationObservation {
  id: string | number;
  versionId: string | number;
  name: string;
  enforcement: string;
  targetRefs: string[];
  excludedTargetRefs: string[];
  bypassActors: unknown[];
  rules: RulesetRuleLike[];
}

export interface RulesetReconciliationPlanInput {
  observation: RulesetReconciliationObservation;
  expectedRulesetId: string;
  expectedVersionId: string;
  expectedFingerprint: string;
  requestedRules: RulesetRuleLike[];
  requiredStatusCheckNames: string[];
  requirePullRequest: boolean;
  blockForcePushes: boolean;
  blockDeletion: boolean;
}

export interface RulesetReconciliationPlan {
  rulesetId: string;
  versionId: string;
  observedFingerprint: string;
  desired: RulesetReconciliationObservation;
  statusChecks: {
    added: string[];
    removed: string[];
    retained: string[];
  };
  executionAuthorized: false;
  requiresFreshProviderReadback: true;
}

const MANAGED_RULE_TYPES = new Set(["pull_request", "required_status_checks", "non_fast_forward", "deletion"]);

function asParameters(rule: RulesetRuleLike | undefined): Record<string, unknown> {
  return rule?.parameters && typeof rule.parameters === "object" ? rule.parameters : {};
}

function securityBoolean(existing: Record<string, unknown>, requested: Record<string, unknown>, key: string): boolean {
  return existing[key] === true || requested[key] === true;
}

function reviewCount(parameters: Record<string, unknown>): number {
  const value = parameters["required_approving_review_count"];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function checkEntries(parameters: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = parameters["required_status_checks"];
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function contextOf(entry: Record<string, unknown>): string {
  return typeof entry["context"] === "string" ? entry["context"].trim() : "";
}

function requiredStatusContexts(rules: RulesetRuleLike[]): string[] {
  const rule = rules.find((candidate) => candidate.type === "required_status_checks");
  return checkEntries(asParameters(rule)).map(contextOf).filter((context) => context.length > 0);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function fingerprintRulesetReconciliationObservation(observation: RulesetReconciliationObservation): string {
  const canonical = canonicalize({
    id: String(observation.id),
    versionId: String(observation.versionId),
    name: observation.name,
    enforcement: observation.enforcement,
    targetRefs: observation.targetRefs,
    excludedTargetRefs: observation.excludedTargetRefs,
    bypassActors: observation.bypassActors,
    rules: observation.rules,
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function mergeExistingRulesetSecurity({ existingRules, requestedRules, requiredStatusCheckNames, requirePullRequest, blockForcePushes, blockDeletion }: MergeExistingRulesetSecurityInput): RulesetRuleLike[] {
  const requestedByType = new Map(requestedRules.map((rule) => [rule.type, rule]));
  const existingByType = new Map(existingRules.map((rule) => [rule.type, rule]));
  const nextRules = existingRules.filter((rule) => !MANAGED_RULE_TYPES.has(String(rule.type ?? ""))).map((rule) => structuredClone(rule));

  const existingPullRequestRule = existingByType.get("pull_request");
  if (requirePullRequest || existingPullRequestRule) {
    const requestedRule = requestedByType.get("pull_request") ?? { type: "pull_request", parameters: {} };
    const existingParameters = asParameters(existingPullRequestRule);
    const requestedParameters = asParameters(requestedRule);
    nextRules.push({
      ...structuredClone(existingPullRequestRule ?? {}),
      ...structuredClone(requestedRule),
      type: "pull_request",
      parameters: {
        ...structuredClone(existingParameters),
        ...structuredClone(requestedParameters),
        required_approving_review_count: Math.max(reviewCount(existingParameters), reviewCount(requestedParameters)),
        dismiss_stale_reviews_on_push: securityBoolean(existingParameters, requestedParameters, "dismiss_stale_reviews_on_push"),
        require_code_owner_review: securityBoolean(existingParameters, requestedParameters, "require_code_owner_review"),
        require_last_push_approval: securityBoolean(existingParameters, requestedParameters, "require_last_push_approval"),
        required_review_thread_resolution: securityBoolean(existingParameters, requestedParameters, "required_review_thread_resolution"),
      },
    });
  }

  if (requiredStatusCheckNames.length > 0) {
    const existingRule = existingByType.get("required_status_checks");
    const requestedRule = requestedByType.get("required_status_checks") ?? { type: "required_status_checks", parameters: {} };
    const existingParameters = asParameters(existingRule);
    const requestedParameters = asParameters(requestedRule);
    const existingChecks = new Map(checkEntries(existingParameters).map((entry) => [contextOf(entry), entry] as const).filter(([context]) => context.length > 0));
    const requestedChecks = new Map(checkEntries(requestedParameters).map((entry) => [contextOf(entry), entry] as const).filter(([context]) => context.length > 0));
    nextRules.push({
      ...structuredClone(existingRule ?? {}),
      ...structuredClone(requestedRule),
      type: "required_status_checks",
      parameters: {
        ...structuredClone(existingParameters),
        ...structuredClone(requestedParameters),
        strict_required_status_checks_policy: existingParameters["strict_required_status_checks_policy"] === true || requestedParameters["strict_required_status_checks_policy"] === true,
        required_status_checks: requiredStatusCheckNames.map((context) => structuredClone(existingChecks.get(context) ?? requestedChecks.get(context) ?? { context })),
      },
    });
  }

  if (blockForcePushes || existingByType.has("non_fast_forward")) nextRules.push(structuredClone(existingByType.get("non_fast_forward") ?? requestedByType.get("non_fast_forward") ?? { type: "non_fast_forward" }));
  if (blockDeletion || existingByType.has("deletion")) nextRules.push(structuredClone(existingByType.get("deletion") ?? requestedByType.get("deletion") ?? { type: "deletion" }));
  return nextRules;
}

export function planExistingRulesetReconciliation({
  observation,
  expectedRulesetId,
  expectedVersionId,
  expectedFingerprint,
  requestedRules,
  requiredStatusCheckNames,
  requirePullRequest,
  blockForcePushes,
  blockDeletion,
}: RulesetReconciliationPlanInput): RulesetReconciliationPlan {
  const rulesetId = String(observation.id);
  const versionId = String(observation.versionId);
  const observedFingerprint = fingerprintRulesetReconciliationObservation(observation);

  if (rulesetId !== expectedRulesetId) {
    throw new Error(`ruleset reconciliation refused: expected ruleset ${expectedRulesetId}, observed ${rulesetId}`);
  }
  if (versionId !== expectedVersionId) {
    throw new Error(`ruleset reconciliation refused: expected version ${expectedVersionId}, observed ${versionId}`);
  }
  if (observedFingerprint !== expectedFingerprint) {
    throw new Error("ruleset reconciliation refused: observed provider fingerprint changed");
  }

  const normalizedRequiredChecks = requiredStatusCheckNames.map((context) => context.trim());
  if (normalizedRequiredChecks.some((context) => context.length === 0)) {
    throw new Error("ruleset reconciliation refused: required status check names must be non-empty");
  }
  if (new Set(normalizedRequiredChecks).size !== normalizedRequiredChecks.length) {
    throw new Error("ruleset reconciliation refused: required status check names must be unique");
  }

  for (const entry of checkEntries(asParameters(requestedRules.find((rule) => rule.type === "required_status_checks")))) {
    const integrationId = entry["integration_id"];
    if (integrationId !== undefined && (!Number.isInteger(integrationId) || Number(integrationId) <= 0)) {
      throw new Error(`ruleset reconciliation refused: invalid integration_id for ${contextOf(entry) || "unnamed check"}`);
    }
  }

  const nextRules = mergeExistingRulesetSecurity({
    existingRules: observation.rules,
    requestedRules,
    requiredStatusCheckNames: normalizedRequiredChecks,
    requirePullRequest,
    blockForcePushes,
    blockDeletion,
  });
  const currentChecks = requiredStatusContexts(observation.rules);
  const desiredChecks = requiredStatusContexts(nextRules);
  const currentSet = new Set(currentChecks);
  const desiredSet = new Set(desiredChecks);

  return {
    rulesetId,
    versionId,
    observedFingerprint,
    desired: {
      id: observation.id,
      versionId: observation.versionId,
      name: observation.name,
      enforcement: observation.enforcement,
      targetRefs: structuredClone(observation.targetRefs),
      excludedTargetRefs: structuredClone(observation.excludedTargetRefs),
      bypassActors: structuredClone(observation.bypassActors),
      rules: nextRules,
    },
    statusChecks: {
      added: desiredChecks.filter((context) => !currentSet.has(context)),
      removed: currentChecks.filter((context) => !desiredSet.has(context)),
      retained: desiredChecks.filter((context) => currentSet.has(context)),
    },
    executionAuthorized: false,
    requiresFreshProviderReadback: true,
  };
}
