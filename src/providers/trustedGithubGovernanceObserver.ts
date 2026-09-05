import { Octokit } from "@octokit/rest";

import { getGitHubInstallationToken } from "./githubAppAuth.js";
import {
  CHIEF_GOVERNANCE,
  createTrustedGithubRulesetObservation,
  planChiefProofModeRulesetMigration,
  type ChiefProofModeRulesetMigrationPlan,
  type TrustedGithubRulesetObservation,
} from "./githubGovernanceReconciliation.js";

export interface TrustedChiefGovernanceObservation {
  governanceBoundary: TrustedGithubRulesetObservation;
  exactHeadGate: TrustedGithubRulesetObservation;
}

function numericAppId(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("trusted Chief governance observation requires a numeric GitHub App id");
  }
  return normalized;
}

/**
 * Reads Chief governance through a repository-scoped GitHub App installation
 * token minted by FCR. The caller cannot supply a PAT or installation token,
 * choose another repository, or choose different ruleset ids.
 *
 * This capability is observation-only. It does not expose updateRepoRuleset,
 * merge, deploy, or any other provider mutation.
 */
export async function observeChiefGovernanceWithGitHubApp(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): Promise<TrustedChiefGovernanceObservation> {
  const appId = numericAppId(input.appId);
  if (!input.privateKey.trim()) {
    throw new Error("trusted Chief governance observation requires a GitHub App private key");
  }
  const now = input.now instanceof Date ? input.now : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("trusted Chief governance observation requires a valid observation time");
  }

  const token = await getGitHubInstallationToken(
    appId,
    input.privateKey,
    CHIEF_GOVERNANCE.repository,
  );
  const octokit = new Octokit({
    auth: token,
    userAgent: "founder-control-room-chief-governance-observer",
  });
  const [owner, repo] = CHIEF_GOVERNANCE.repository.split("/");
  const observedAt = now.toISOString();

  const [governanceBoundaryReadback, exactHeadGateReadback] = await Promise.all([
    octokit.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: Number(CHIEF_GOVERNANCE.governanceBoundaryRulesetId),
    }),
    octokit.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: Number(CHIEF_GOVERNANCE.exactHeadRulesetId),
    }),
  ]);

  return {
    governanceBoundary: createTrustedGithubRulesetObservation({
      repository: CHIEF_GOVERNANCE.repository,
      rulesetId: CHIEF_GOVERNANCE.governanceBoundaryRulesetId,
      readback: governanceBoundaryReadback.data,
      observerAppId: appId,
      observedAt,
    }),
    exactHeadGate: createTrustedGithubRulesetObservation({
      repository: CHIEF_GOVERNANCE.repository,
      rulesetId: CHIEF_GOVERNANCE.exactHeadRulesetId,
      readback: exactHeadGateReadback.data,
      observerAppId: appId,
      observedAt,
    }),
  };
}

export async function planChiefGovernanceWithGitHubApp(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): Promise<ChiefProofModeRulesetMigrationPlan> {
  return planChiefProofModeRulesetMigration(
    await observeChiefGovernanceWithGitHubApp(input),
  );
}
