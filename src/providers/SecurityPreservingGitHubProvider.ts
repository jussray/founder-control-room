import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { GitHubProvider, type GitHubProviderConfig } from "./GitHubProvider.js";
import type { RulesetConfig, RulesetResult } from "./RepositoryProvider.js";
import { mergeExistingRulesetSecurity, type RulesetRuleLike } from "./rulesetSecurityMerge.js";

const FOUNDER_CONTROL_ROOM_PROJECT_ID = "founder-control-room";

type UpdateRules = NonNullable<
  RestEndpointMethodTypes["repos"]["updateRepoRuleset"]["parameters"]
>["rules"];

type UpdateBypassActors = NonNullable<
  RestEndpointMethodTypes["repos"]["updateRepoRuleset"]["parameters"]
>["bypass_actors"];

/**
 * Compatibility membrane for provider ruleset updates.
 *
 * GitHub rulesets may contain security rules that the provider-neutral
 * RulesetConfig intentionally does not model. For an existing non-FCR ruleset,
 * preserve those provider-owned protections and narrow only the configured
 * status-check list. Brand-new rulesets and FCR's constitutional main ruleset
 * continue through GitHubProvider unchanged.
 */
export class SecurityPreservingGitHubProvider extends GitHubProvider {
  private readonly adminOctokit: Octokit;
  private readonly projectMapForRulesets: Record<string, string>;

  constructor(config: GitHubProviderConfig) {
    super(config);
    this.adminOctokit = new Octokit({
      auth: config.token,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
    this.projectMapForRulesets = config.projectMap;
  }

  private locateRulesetRepository(projectId: string): { owner: string; repo: string } {
    const locator = this.projectMapForRulesets[projectId];
    if (!locator) {
      throw new Error(`SecurityPreservingGitHubProvider: no repo mapped for projectId "${projectId}"`);
    }
    const [owner, repo] = locator.split("/");
    if (!owner || !repo) {
      throw new Error(`SecurityPreservingGitHubProvider: malformed locator "${locator}"`);
    }
    return { owner, repo };
  }

  private requestedRules(config: RulesetConfig): RulesetRuleLike[] {
    const rules: RulesetRuleLike[] = [];
    if (config.requirePullRequest) {
      rules.push({
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: config.requiredApprovingReviewCount,
          required_review_thread_resolution: true,
        },
      });
    }
    if (config.requiredStatusCheckNames.length > 0) {
      rules.push({
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      });
    }
    if (config.blockForcePushes) rules.push({ type: "non_fast_forward" });
    if (config.blockDeletion) rules.push({ type: "deletion" });
    return rules;
  }

  override async applyBranchRuleset(
    projectId: string,
    config: RulesetConfig,
  ): Promise<RulesetResult> {
    if (projectId === FOUNDER_CONTROL_ROOM_PROJECT_ID) {
      return super.applyBranchRuleset(projectId, config);
    }

    const { owner, repo } = this.locateRulesetRepository(projectId);
    const { data: summaries } = await this.adminOctokit.repos.getRepoRulesets({
      owner,
      repo,
      per_page: 100,
    });
    const existing = summaries.find((ruleset) => ruleset.name === config.name);
    if (!existing) {
      return super.applyBranchRuleset(projectId, config);
    }

    const { data: current } = await this.adminOctokit.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: existing.id,
    });

    const mergedRules = mergeExistingRulesetSecurity({
      existingRules: (current.rules ?? []) as RulesetRuleLike[],
      requestedRules: this.requestedRules(config),
      requiredStatusCheckNames: config.requiredStatusCheckNames,
      requirePullRequest: config.requirePullRequest,
      blockForcePushes: config.blockForcePushes,
      blockDeletion: config.blockDeletion,
    }) as UpdateRules;

    const bypassActors: UpdateBypassActors = !config.bypassActors || config.bypassActors.length === 0
      ? (current.bypass_actors ?? []) as UpdateBypassActors
      : config.bypassActors.map((actor) => {
          if (actor.kind !== "app") {
            throw new Error(`SecurityPreservingGitHubProvider: unsupported bypass actor kind "${actor.kind}"`);
          }
          return {
            actor_type: "Integration" as const,
            actor_id: Number(actor.id),
            bypass_mode: "always" as const,
          };
        });

    const { data } = await this.adminOctokit.repos.updateRepoRuleset({
      owner,
      repo,
      ruleset_id: existing.id,
      name: config.name,
      target: "branch",
      enforcement: config.enforcement,
      bypass_actors: bypassActors,
      conditions: {
        ref_name: {
          include: config.targetRefs.map((ref) => `refs/heads/${ref}`),
          exclude: [],
        },
      },
      rules: mergedRules,
    });

    return {
      id: String(data.id),
      name: data.name,
      enforcement: data.enforcement,
    };
  }
}
