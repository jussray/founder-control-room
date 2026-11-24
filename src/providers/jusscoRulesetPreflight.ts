import { createHash } from "node:crypto";

/**
 * Read-only FCR handoff for the two existing jussray/jussray branch rulesets.
 * GitHub's ruleset PUT has no documented atomic compare-and-swap precondition.
 * A fingerprint detects stale observations but CANNOT authorize a write.
 */
export const JUSSCO_RULESET_PREFLIGHT_CONTRACT = "fcr/jussco-ruleset-preflight@v1" as const;
export const JUSSCO_RULESET_REPOSITORY = "jussray/jussray" as const;
export const JUSSCO_RULESET_IDS = Object.freeze({
  Governance: 26857902,
  Production: 26428639,
});
const GITHUB_ACTIONS_INTEGRATION_ID = 15368;
const REQUIRED_REVIEW_COUNT = 1;
const EXPECTED_PRODUCTION_REFS = [
  "refs/heads/main",
  "refs/heads/Production",
  "refs/heads/releases",
  "refs/heads/Deployed",
] as const;

type ObjectRecord = Record<string, unknown>;
type RulesetName = keyof typeof JUSSCO_RULESET_IDS;

export interface JusscoRulesetReadPort {
  getRepoRuleset(input: { repository: typeof JUSSCO_RULESET_REPOSITORY; rulesetId: number }): Promise<unknown>;
}

export interface JusscoRulesetPreflightRequest {
  repository: string;
  rulesetId: number;
  expectedFingerprint: string;
  provider: JusscoRulesetReadPort;
}

export interface JusscoRulesetPreflight {
  contract: typeof JUSSCO_RULESET_PREFLIGHT_CONTRACT;
  repository: typeof JUSSCO_RULESET_REPOSITORY;
  rulesetId: number;
  rulesetName: RulesetName;
  observedFingerprint: string;
  observedChecks: string[];
  observedRefScope: string[];
  observedBypassCount: number;
  observedDeploymentCount: number;
  gaps: string[];
  suggestedReview: string[];
  disposition: "NO_CHANGE_REQUIRED" | "BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE";
  providerMutationPerformed: false;
  mutationAuthorized: false;
  mergeAuthorized: false;
  deployAuthorized: false;
}

function asRecord(value: unknown, label: string): ObjectRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be a provider-observed object");
  }
  return value as ObjectRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(label + " must be provider-observed");
  return value;
}

function asStrings(value: unknown, label: string): string[] {
  return asArray(value, label).map((part) => {
    if (typeof part !== "string" || part.trim() === "") {
      throw new Error(label + " contains a non-string or empty entry");
    }
    return part;
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as ObjectRecord;
    return "{" + Object.keys(obj).sort().map((key) =>
      JSON.stringify(key) + ":" + canonicalJson(obj[key]),
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function fingerprintJusscoRuleset(readback: unknown): string {
  return createHash("sha256").update(canonicalJson(readback)).digest("hex");
}

function ruleOfType(rules: unknown[], type: string): ObjectRecord | null {
  const found = rules.filter((item) => asRecord(item, "ruleset rule").type === type);
  if (found.length > 1) throw new Error("duplicate " + type + " rules");
  return found.length ? asRecord(found[0], type + " rule") : null;
}

function identifiedName(repository: string, rulesetId: number): RulesetName {
  if (repository !== JUSSCO_RULESET_REPOSITORY) {
    throw new Error("UNAUTHORIZED_REPOSITORY: only " + JUSSCO_RULESET_REPOSITORY + " is permitted");
  }
  const match = (Object.entries(JUSSCO_RULESET_IDS) as [RulesetName, number][])
    .find(([, id]) => id === rulesetId);
  if (!match) throw new Error("UNAUTHORIZED_RULESET_ID: " + String(rulesetId));
  return match[0];
}

/**
 * No write capability is accepted by this function. Its output is an inspectable
 * administrator handoff, NOT an update request or merge/release authority.
 */
export async function preflightJusscoRuleset(input: JusscoRulesetPreflightRequest): Promise<JusscoRulesetPreflight> {
  const name = identifiedName(input.repository, input.rulesetId);
  if (!/^[a-f0-9]{64}$/.test(input.expectedFingerprint)) {
    throw new Error("EXPECTED_PROVIDER_FINGERPRINT_REQUIRED");
  }

  const readback = asRecord(await input.provider.getRepoRuleset({
    repository: JUSSCO_RULESET_REPOSITORY,
    rulesetId: input.rulesetId,
  }), "ruleset readback");
  if (readback.id !== input.rulesetId || readback.name !== name ||
      readback.target !== "branch" || readback.enforcement !== "active") {
    throw new Error("RULESET_IDENTITY_OR_ENFORCEMENT_MISMATCH");
  }

  const observedFingerprint = fingerprintJusscoRuleset(readback);
  if (observedFingerprint !== input.expectedFingerprint) {
    throw new Error("STALE_RULESET_OBSERVATION");
  }

  const condition = asRecord(readback.conditions, "ruleset conditions");
  const refName = asRecord(condition.ref_name, "ruleset ref_name");
  const included = asStrings(refName.include, "included refs");
  const excluded = asStrings(refName.exclude, "excluded refs");
  if (excluded.includes("~ALL") || excluded.includes("refs/heads/main") ||
      (!included.includes("~ALL") && !included.includes("refs/heads/main") && !included.includes("~DEFAULT_BRANCH"))) {
    throw new Error("MAIN_BRANCH_NOT_PROTECTED");
  }

  const rules = asArray(readback.rules, "ruleset rules");
  const pullRequest = ruleOfType(rules, "pull_request");
  if (!pullRequest ||
      asRecord(pullRequest.parameters, "pull request parameters").required_approving_review_count !== REQUIRED_REVIEW_COUNT) {
    throw new Error("INDEPENDENT_HUMAN_APPROVAL_FLOOR_REQUIRED");
  }

  const status = ruleOfType(rules, "required_status_checks");
  if (!status) throw new Error("REQUIRED_STATUS_RULE_MISSING");
  const statusParams = asRecord(status.parameters, "status check parameters");
  const observedChecks = asArray(statusParams.required_status_checks, "required checks").map((check) => {
    const entry = asRecord(check, "required check");
    if (typeof entry.context !== "string" || !entry.context.trim()) {
      throw new Error("INVALID_REQUIRED_CHECK_CONTEXT");
    }
    return entry.context;
  });
  if (new Set(observedChecks).size !== observedChecks.length) {
    throw new Error("DUPLICATE_REQUIRED_CHECK_CONTEXT");
  }

  const bypass = asArray(readback.bypass_actors, "bypass actors");
  const deployments = ruleOfType(rules, "required_deployments");
  const deploymentCount = deployments
    ? asStrings(asRecord(deployments.parameters, "deployment parameters")
        .required_deployment_environments, "deployment environments").length
    : 0;
  const gaps: string[] = [];
  const suggestedReview: string[] = [];

  if (name === "Governance") {
    if (statusParams.strict_required_status_checks_policy !== true) {
      gaps.push("Enable strict required-status freshness");
    }
    const gateCheck = asArray(statusParams.required_status_checks, "required checks")
      .some((check) => {
        const c = asRecord(check, "required check");
        return c.context === "Review Gate Unit Tests" &&
          c.integration_id === GITHUB_ACTIONS_INTEGRATION_ID;
      });
    if (!gateCheck) gaps.push("Bind Review Gate Unit Tests to verified GitHub Actions producer 15368");
    if (!ruleOfType(rules, "non_fast_forward")) {
      gaps.push("Preserve or enable force-push prevention");
    }
  } else {
    if (included.includes("~ALL") || included.some((ref) =>
      ref !== "~ALL" && !EXPECTED_PRODUCTION_REFS.includes(ref as typeof EXPECTED_PRODUCTION_REFS[number]))) {
      gaps.push("Constrain Production scope to the four protected branches; review unknown refs before removal");
    }
    if (!ruleOfType(rules, "non_fast_forward")) gaps.push("Add force-push prevention");
    if (observedChecks.length === 0) suggestedReview.push("Select produced exact-head checks before requiring them");
    if (bypass.length > 0) suggestedReview.push("Review existing bypass actors separately; do not silently replace them");
  }

  return {
    contract: JUSSCO_RULESET_PREFLIGHT_CONTRACT,
    repository: JUSSCO_RULESET_REPOSITORY,
    rulesetId: input.rulesetId,
    rulesetName: name,
    observedFingerprint,
    observedChecks,
    observedRefScope: included,
    observedBypassCount: bypass.length,
    observedDeploymentCount: deploymentCount,
    gaps,
    suggestedReview,
    disposition: gaps.length === 0 && suggestedReview.length === 0
      ? "NO_CHANGE_REQUIRED"
      : "BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE",
    providerMutationPerformed: false,
    mutationAuthorized: false,
    mergeAuthorized: false,
    deployAuthorized: false,
  };
}
