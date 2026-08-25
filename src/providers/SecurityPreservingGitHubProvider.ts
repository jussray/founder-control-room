import { Octokit } from "@octokit/rest";
import { GitHubProvider, type GitHubProviderConfig } from "./GitHubProvider.js";
import type { RulesetConfig, RulesetResult } from "./RepositoryProvider.js";

const FOUNDER_CONTROL_ROOM_PROJECT_ID = "founder-control-room";

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
  const excludedSet = new Set(excluded.map(normalizeBranchRef));
  return requested.map(normalizeBranchRef).filter((ref) => excludedSet.has(ref));
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

  override async applyBranchRuleset(projectId: string, config: RulesetConfig): Promise<RulesetResult> {
    if (projectId === FOUNDER_CONTROL_ROOM_PROJECT_ID) return super.applyBranchRuleset(projectId, config);

    const { owner, repo } = this.locateRulesetRepository(projectId);
    const { data: summaries } = await this.adminOctokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    const existing = summaries.find((ruleset) => ruleset.name === config.name);
    if (!existing) return super.applyBranchRuleset(projectId, config);

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
        `SecurityPreservingGitHubProvider: requested target refs remain excluded by the existing ruleset: ${conflictingRequestedRefs.join(", ")}`,
      );
    }

    // An explicit empty bypassActors list still represents a valid request-level
    // distinction from omission, but applying either shape to an existing ruleset
    // requires a full provider PUT. GitHub exposes no repository-used atomic
    // compare-and-swap/version precondition for that write, so any existing
    // non-FCR mutation can overwrite hardening that lands after this read.
    // Preserve the request distinction at the route boundary, then fail closed
    // here until a separately reviewed concurrency-safe reconciler exists.
    throw new Error(
      "SecurityPreservingGitHubProvider: existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
    );
  }
}
