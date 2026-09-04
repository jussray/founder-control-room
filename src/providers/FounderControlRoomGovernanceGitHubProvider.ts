import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { DeterministicReviewGitHubProvider } from "./DeterministicReviewGitHubProvider.js";
import type { GitHubProviderConfig } from "./GitHubProvider.js";
import type { RulesetConfig, RulesetResult } from "./RepositoryProvider.js";
import {
  fcrGovernancePhaseErrors,
  independentReviewRequired,
  readFcrGovernancePhase,
} from "./fcrGovernancePhase.js";

const PROJECT_ID = "founder-control-room";
const CODEQL_TOOL = "CodeQL";
const CODEQL_SECURITY_THRESHOLD = "high_or_higher";
const CODEQL_ALERTS_THRESHOLD = "errors";

type RepoRule = NonNullable<
  RestEndpointMethodTypes["repos"]["createRepoRuleset"]["parameters"]
>["rules"] extends (infer R)[] | undefined ? R : never;

type RulesetReadback = {
  name?: string;
  enforcement?: string;
  bypass_actors?: Array<{ actor_type?: string; actor_id?: number; bypass_mode?: string }>;
  conditions?: { ref_name?: { include?: string[] } };
  rules?: Array<{ type?: string; parameters?: Record<string, unknown> }>;
};

function freshnessName(name: string): string {
  return `${name} [strict freshness]`;
}

function normalizedBypasses(value: RulesetReadback): string[] {
  return (value.bypass_actors ?? [])
    .map((actor) => `${actor.actor_type ?? ""}:${Number(actor.actor_id)}:${actor.bypass_mode ?? ""}`)
    .sort();
}

function expectedBypasses(config: RulesetConfig): string[] {
  return (config.bypassActors ?? [])
    .map((actor) => actor.kind === "app"
      ? `Integration:${Number(actor.id)}:pull_request`
      : `unsupported:${actor.kind}:${actor.id}`)
    .sort();
}

function statusCheckNames(value: RulesetReadback): string[] {
  const rule = (value.rules ?? []).find((entry) => entry.type === "required_status_checks");
  const raw = rule?.parameters?.required_status_checks;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry && typeof entry === "object" && "context" in entry
      ? String((entry as { context?: unknown }).context ?? "").trim()
      : "")
    .filter(Boolean)
    .sort();
}

function validateConfig(config: RulesetConfig): string[] {
  const errors = fcrGovernancePhaseErrors(config);
  if (!config.requirePullRequest) errors.push("pull requests must be required");

  const checks = config.requiredStatusCheckNames.map((name) => name.trim());
  if (checks.length === 0) errors.push("at least one required status check is required");
  if (checks.some((name) => !name)) errors.push("required status check names must be non-empty");
  if (new Set(checks).size !== checks.length) errors.push("required status check names must be unique");

  const bypass = config.bypassActors ?? [];
  if (bypass.length !== 1 || bypass[0]?.kind !== "app" || !/^\d+$/.test(bypass[0].id.trim())) {
    errors.push("exactly one numeric GitHub App bypass actor is required");
  }
  if (!config.blockForcePushes) errors.push("force pushes must remain blocked");
  if (!config.blockDeletion) errors.push("branch deletion must remain blocked");
  return errors;
}

function reviewReadbackErrors(config: RulesetConfig, value: unknown): string[] {
  const readback = value && typeof value === "object" && !Array.isArray(value)
    ? value as RulesetReadback
    : {};
  const errors: string[] = [];
  const independent = independentReviewRequired(config);

  if (readback.name !== config.name) errors.push("ruleset name did not round-trip");
  if (readback.enforcement !== config.enforcement) errors.push("ruleset enforcement did not round-trip");
  const targets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    if (!targets.includes(`refs/heads/${target}`)) errors.push(`missing requested target refs/heads/${target}`);
  }
  if (JSON.stringify(normalizedBypasses(readback)) !== JSON.stringify(expectedBypasses(config))) {
    errors.push("bypass actors do not match requested policy");
  }

  const rules = readback.rules ?? [];
  const pull = rules.find((rule) => rule.type === "pull_request");
  const params = pull?.parameters ?? {};
  if (!pull) errors.push("pull request rule is missing");
  if (params.required_approving_review_count !== config.requiredApprovingReviewCount) {
    errors.push("approving review count does not match requested phase");
  }
  if (params.dismiss_stale_reviews_on_push !== independent) errors.push("stale-review policy does not match requested phase");
  if (params.require_code_owner_review !== independent) errors.push("Code Owner policy does not match requested phase");
  if (params.require_last_push_approval !== independent) errors.push("last-push approval policy does not match requested phase");
  if (params.required_review_thread_resolution !== true) errors.push("review-thread resolution must remain required");
  if (rules.some((rule) => rule.type === "required_status_checks")) {
    errors.push("review membrane must not own bypassable required-status freshness");
  }

  const codeRules = rules.filter((rule) => rule.type === "code_scanning");
  const tools = Array.isArray(codeRules[0]?.parameters?.code_scanning_tools)
    ? codeRules[0].parameters.code_scanning_tools
    : [];
  const exactCodeQL = codeRules.length === 1
    && tools.length === 1
    && tools[0]
    && typeof tools[0] === "object"
    && (tools[0] as { tool?: unknown }).tool === CODEQL_TOOL
    && (tools[0] as { security_alerts_threshold?: unknown }).security_alerts_threshold === CODEQL_SECURITY_THRESHOLD
    && (tools[0] as { alerts_threshold?: unknown }).alerts_threshold === CODEQL_ALERTS_THRESHOLD;
  if (!exactCodeQL) errors.push("CodeQL floor does not match constitutional policy");
  if (!rules.some((rule) => rule.type === "non_fast_forward")) errors.push("force-push protection is missing");
  if (!rules.some((rule) => rule.type === "deletion")) errors.push("deletion protection is missing");

  const observedTypes = rules.map((rule) => String(rule.type ?? "")).filter(Boolean).sort();
  const expectedTypes = ["pull_request", "code_scanning", "non_fast_forward", "deletion"].sort();
  if (JSON.stringify(observedTypes) !== JSON.stringify(expectedTypes)) errors.push("review membrane rule types drifted");
  return errors;
}

function freshnessReadbackErrors(config: RulesetConfig, expectedName: string, value: unknown): string[] {
  const readback = value && typeof value === "object" && !Array.isArray(value)
    ? value as RulesetReadback
    : {};
  const errors: string[] = [];
  if (readback.name !== expectedName) errors.push("freshness name did not round-trip");
  if (readback.enforcement !== config.enforcement) errors.push("freshness enforcement did not round-trip");
  const targets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    if (!targets.includes(`refs/heads/${target}`)) errors.push(`freshness missing target refs/heads/${target}`);
  }
  if (normalizedBypasses(readback).length !== 0) errors.push("strict freshness must have zero bypass actors");
  const rules = readback.rules ?? [];
  if (rules.length !== 1 || rules[0]?.type !== "required_status_checks") {
    errors.push("strict freshness must contain exactly one required-status rule");
  }
  if (rules[0]?.parameters?.strict_required_status_checks_policy !== true) errors.push("strict freshness is not strict");
  const expectedChecks = config.requiredStatusCheckNames.map((name) => name.trim()).sort();
  if (JSON.stringify(statusCheckNames(readback)) !== JSON.stringify(expectedChecks)) errors.push("strict freshness checks drifted");
  return errors;
}

/**
 * Canonical FCR provider extension. It changes only FCR main ruleset semantics:
 * founder_only keeps PR + exact-head + CodeQL + deletion/force-push protection
 * while requiring zero outside approvals; independent_review turns the human
 * review controls back on without changing the machine/security floor.
 */
export class FounderControlRoomGovernanceGitHubProvider extends DeterministicReviewGitHubProvider {
  private readonly governanceOctokit: Octokit;

  constructor(config: GitHubProviderConfig) {
    super(config);
    this.governanceOctokit = new Octokit({
      auth: config.token,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
  }

  override async applyBranchRuleset(projectId: string, config: RulesetConfig): Promise<RulesetResult> {
    const canonicalFcrMain = projectId === PROJECT_ID
      && config.enforcement === "active"
      && config.targetRefs.includes("main");
    if (!canonicalFcrMain) return super.applyBranchRuleset(projectId, config);

    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`FounderControlRoomGovernanceGitHubProvider: FCR main ruleset rejected: ${errors.join("; ")}`);
    }
    const phase = readFcrGovernancePhase(config)!;
    const independent = phase === "independent_review";
    const locator = "jussray/founder-control-room";
    const [owner, repo] = locator.split("/");

    const reviewRules: RepoRule[] = [
      {
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: independent,
          require_code_owner_review: independent,
          require_last_push_approval: independent,
          required_approving_review_count: config.requiredApprovingReviewCount,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "code_scanning",
        parameters: {
          code_scanning_tools: [{
            tool: CODEQL_TOOL,
            security_alerts_threshold: CODEQL_SECURITY_THRESHOLD,
            alerts_threshold: CODEQL_ALERTS_THRESHOLD,
          }],
        },
      },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ];

    const bypassActors = (config.bypassActors ?? []).map((actor) => ({
      actor_type: "Integration" as const,
      actor_id: Number(actor.id),
      bypass_mode: "pull_request" as const,
    }));
    const conditions = {
      ref_name: {
        include: config.targetRefs.map((ref) => `refs/heads/${ref}`),
        exclude: [],
      },
    };
    const reviewPayload = {
      owner,
      repo,
      name: config.name,
      target: "branch" as const,
      enforcement: config.enforcement,
      bypass_actors: bypassActors,
      conditions,
      rules: reviewRules,
    };
    const strictName = freshnessName(config.name);
    const freshnessPayload = {
      owner,
      repo,
      name: strictName,
      target: "branch" as const,
      enforcement: config.enforcement,
      bypass_actors: [],
      conditions,
      rules: [{
        type: "required_status_checks" as const,
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      }],
    };

    const { data: existing } = await this.governanceOctokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });

    // Freshness goes first so a partial failure can never remove the exact-head floor.
    const freshnessMatch = existing.find((ruleset) => ruleset.name === strictName);
    const { data: freshnessData } = freshnessMatch
      ? await this.governanceOctokit.repos.updateRepoRuleset({ ...freshnessPayload, ruleset_id: freshnessMatch.id })
      : await this.governanceOctokit.repos.createRepoRuleset(freshnessPayload);
    const { data: freshnessReadback } = await this.governanceOctokit.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: freshnessData.id,
    });
    const freshnessErrors = freshnessReadbackErrors(config, strictName, freshnessReadback);
    if (freshnessErrors.length > 0) {
      throw new Error(`FounderControlRoomGovernanceGitHubProvider: strict freshness readback mismatch: ${freshnessErrors.join("; ")}`);
    }

    const reviewMatch = existing.find((ruleset) => ruleset.name === config.name);
    const { data: reviewData } = reviewMatch
      ? await this.governanceOctokit.repos.updateRepoRuleset({ ...reviewPayload, ruleset_id: reviewMatch.id })
      : await this.governanceOctokit.repos.createRepoRuleset(reviewPayload);
    const { data: reviewReadback } = await this.governanceOctokit.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: reviewData.id,
    });
    const reviewErrors = reviewReadbackErrors(config, reviewReadback);
    if (reviewErrors.length > 0) {
      throw new Error(`FounderControlRoomGovernanceGitHubProvider: review membrane readback mismatch: ${reviewErrors.join("; ")}`);
    }

    return {
      id: String(reviewData.id),
      name: reviewData.name,
      enforcement: reviewData.enforcement,
      components: [
        { purpose: "review", id: String(reviewData.id), name: reviewData.name, enforcement: reviewData.enforcement },
        { purpose: "strict_freshness", id: String(freshnessData.id), name: freshnessData.name, enforcement: freshnessData.enforcement },
      ],
    };
  }
}
