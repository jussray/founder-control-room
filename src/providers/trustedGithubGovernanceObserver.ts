import { Octokit } from "@octokit/rest";

import {
  getGitHubInstallationToken,
  observeGitHubRepositoryInstallation,
} from "./githubAppAuth.js";
import {
  CHIEF_GOVERNANCE,
  createTrustedGithubRulesetObservation,
  verifyChiefProofModeRulesetsAsIs,
  type ChiefProofModeRulesetVerification,
  type TrustedGithubRulesetObservation,
} from "./githubGovernanceReconciliation.js";

export interface TrustedChiefGovernanceObservation {
  governanceBoundary: TrustedGithubRulesetObservation;
  exactHeadGate: TrustedGithubRulesetObservation;
}

export interface TrustedChiefCandidateProducerInstallationObservation {
  repository: string;
  appId: string;
  installationId: string;
  repositorySelection: string;
  permissions: Readonly<Record<string, string>>;
  checksPermission: string | null;
  checksWriteAvailable: boolean;
  observedAt: string;
  authority: {
    candidateCheckPublicationAuthority: false;
    providerMutationAuthority: false;
  };
}

function numericAppId(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("trusted Chief governance observation requires a numeric GitHub App id");
  }
  return normalized;
}

function requirePrivateKey(value: string): string {
  if (!value.trim()) {
    throw new Error("trusted Chief governance observation requires a GitHub App private key");
  }
  return value;
}

function observationTime(value: Date | undefined): string {
  const now = value instanceof Date ? value : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("trusted Chief governance observation requires a valid observation time");
  }
  return now.toISOString();
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
  const privateKey = requirePrivateKey(input.privateKey);
  const observedAt = observationTime(input.now);

  const token = await getGitHubInstallationToken(
    appId,
    privateKey,
    CHIEF_GOVERNANCE.repository,
  );
  const octokit = new Octokit({
    auth: token,
    userAgent: "founder-control-room-chief-governance-observer",
  });
  const [owner, repo] = CHIEF_GOVERNANCE.repository.split("/");

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

/**
 * Reads the custom App's installation identity and permissions for Chief
 * without minting a token or publishing a probe Check Run. `checks: write`
 * proves capability only; candidate publication authority remains false until
 * a separately contracted narrow producer exists and its output is read back.
 */
export async function observeChiefCandidateProducerInstallationWithGitHubApp(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): Promise<TrustedChiefCandidateProducerInstallationObservation> {
  const appId = numericAppId(input.appId);
  const privateKey = requirePrivateKey(input.privateKey);
  const observedAt = observationTime(input.now);
  const evidence = await observeGitHubRepositoryInstallation(
    appId,
    privateKey,
    CHIEF_GOVERNANCE.repository,
  );
  const checksPermission = evidence.permissions.checks ?? null;

  return {
    repository: evidence.repository,
    appId: evidence.appId,
    installationId: evidence.installationId,
    repositorySelection: evidence.repositorySelection,
    permissions: evidence.permissions,
    checksPermission,
    checksWriteAvailable: checksPermission === "write",
    observedAt,
    authority: {
      candidateCheckPublicationAuthority: false,
      providerMutationAuthority: false,
    },
  };
}

/**
 * Verifies the founder-approved Chief governance readback exactly as observed.
 * This never constructs, requests, or authorizes a ruleset mutation.
 */
export async function verifyChiefGovernanceWithGitHubApp(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): Promise<ChiefProofModeRulesetVerification> {
  return verifyChiefProofModeRulesetsAsIs(
    await observeChiefGovernanceWithGitHubApp(input),
  );
}

/** @deprecated Compatibility wrapper. No Chief ruleset migration is planned or authorized. */
export async function planChiefGovernanceWithGitHubApp(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): Promise<ChiefProofModeRulesetVerification> {
  return verifyChiefGovernanceWithGitHubApp(input);
}
