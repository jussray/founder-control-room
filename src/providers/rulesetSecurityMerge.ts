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
