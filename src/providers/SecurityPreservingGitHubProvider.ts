import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { GitHubProvider, type GitHubProviderConfig } from "./GitHubProvider.js";
import type { RulesetConfig, RulesetResult } from "./RepositoryProvider.js";
import type { RulesetRuleLike } from "./rulesetSecurityMerge.js";

const FOUNDER_CONTROL_ROOM_PROJECT_ID = "founder-control-room";

type CreateRules = NonNullable<
  RestEndpointMethodTypes["repos"]["createRepoRuleset"]["parameters"]
>["rules"];
type CreateBypassActors = NonNullable<
  RestEndpointMethodTypes["repos"]["createRepoRuleset"]["parameters"]
>["bypass_actors"];
type RulesetEnforcement = RulesetConfig["enforcement"];

const enforcementRank: Record<RulesetEnforcement, number> = {
  disabled: 0,
  evaluate: 1,
  active: 2,
};

export function mergeExistingRulesetEnforcement(
  existing: RulesetEnforcement,
  requested: RulesetEnforcement,
): RulesetEnforcement {
  return enforcementRank[existing] >= enforcementRank[requested] ? existing : requested;
}

function normalizeBranchRef(ref: string): string {
  if (ref.startsWith("refs/") || ref.startsWith("~")) return ref;
  return `refs/heads/${ref}`;
}

export function mergeExistingRulesetTargetRefs(existing: string[], requested: string[]): string[] {
  return [...new Set([...existing, ...requested].map(normalizeBranchRef))];
}

export function requestedRefsRemainingExcluded(requested: string[], excluded: string[]): string[] {
  const normalizedRequested = requested.map(normalizeBranchRef);
  const normalizedExcluded = new Set(excluded.map(normalizeBranchRef));

  if (normalizedExcluded.has("~ALL")) return normalizedRequested;
  return normalizedRequested.filter((ref) => normalizedExcluded.has(ref));
}

export class SecurityPreservingGitHubProvider extends GitHubProvider {
  private readonly adminOctokit: Octokit;
  private readonly projectMapForRulesets: Record<string, string>;

  constructor(config: GitHubProviderConfig) {
    super(config);
    this.adminOctokit = new Octokit({ auth: config.token, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
    this.projectMapForRulesets = config.projectMap;
  }

  private locateRulesetRepository(projectId: string): { owner: string; repo: string } {
    const locator = this.projectMapForRulesets[projectId];
    if (!locator) throw new Error(`SecurityPreservingGitHubProvider: no repo mapped for projectId "${projectId}"`);
    const [owner, repo] = locator.split("/");
    if (!owner || !repo) throw new Error(`SecurityPreservingGitHubProvider: malformed locator "${locator}"`);
    return { owner, repo };
  }

  private requestedRules(config: RulesetConfig): RulesetRuleLike[] {
    const rules: RulesetRuleLike[] = [];
    if (config.requirePullRequest) {
      rules.push({ type: "pull_request", parameters: {
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_approving_review_count: config.requiredApprovingReviewCount,
        required_review_thread_resolution: true,
      } });
    }
    if (config.requiredStatusCheckNames.length > 0) {
      rules.push({ type: "required_status_checks", parameters: {
        do_not_enforce_on_create: false,
        required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
        strict_required_status_checks_policy: true,
      } });
    }
    if (config.blockForcePushes) rules.push({ type: "non_fast_forward" });
    if (config.blockDeletion) rules.push({ type: "deletion" });
    return rules;
  }

  private requestedBypassActors(config: RulesetConfig): CreateBypassActors {
    return (config.bypassActors ?? []).map((actor) => {
      if (actor.kind !== "app") {
        throw new Error(`SecurityPreservingGitHubProvider: unsupported bypass actor kind "${actor.kind}"`);
      }
      return {
        actor_type: "Integration" as const,
        actor_id: Number(actor.id),
        bypass_mode: "always" as const,
      };
    });
  }

  override async applyBranchRuleset(projectId: string, config: RulesetConfig): Promise<RulesetResult> {
    if (projectId === FOUNDER_CONTROL_ROOM_PROJECT_ID) return super.applyBranchRuleset(projectId, config);

    const { owner, repo } = this.locateRulesetRepository(projectId);
    const { data: summaries } = await this.adminOctokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    const existing = summaries.find((ruleset) => ruleset.name === config.name);

    if (!existing) {
      const { data } = await this.adminOctokit.repos.createRepoRuleset({
        owner,
        repo,
        name: config.name,
        target: "branch",
        enforcement: config.enforcement,
        bypass_actors: this.requestedBypassActors(config),
        conditions: {
          ref_name: {
            include: config.targetRefs.map(normalizeBranchRef),
            exclude: [],
          },
        },
        rules: this.requestedRules(config) as CreateRules,
      });
      return { id: String(data.id), name: data.name, enforcement: data.enforcement };
    }

    const { data: current } = await this.adminOctokit.repos.getRepoRuleset({ owner, repo, ruleset_id: existing.id });

    if (config.bypassActors && config.bypassActors.length > 0) {
      throw new Error(
        "SecurityPreservingGitHubProvider: existing ruleset updates cannot replace existing bypass posture without a separate bypass-authority contract",
      );
    }

    const currentExcludes = current.conditions?.ref_name?.exclude ?? [];
    const conflictingRequestedRefs = requestedRefsRemainingExcluded(config.targetRefs, currentExcludes);
    if (conflictingRequestedRefs.length > 0) {
      throw new Error(
        `SecurityPreservingGitHubProvider: requested target refs remain explicitly excluded by the existing ruleset: ${conflictingRequestedRefs.join(", ")}`,
      );
    }

    throw new Error(
      "SecurityPreservingGitHubProvider: existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
    );
  }
}
