import type { GitHubRepositoryInstallationEvidence } from "./githubAppAuth.js";

export type GitHubAppRequiredPermissionLevel = "read" | "write";

export interface GitHubAppRepositoryCapabilityContract {
  repository: string;
  appId: string;
  installationId: string;
  repositorySelection: string;
  permissions: Readonly<Record<string, string>>;
  readablePermissions: readonly string[];
  writablePermissions: readonly string[];
  can: Readonly<{
    readContents: boolean;
    writeContents: boolean;
    readPullRequests: boolean;
    writePullRequests: boolean;
    readChecks: boolean;
    writeChecks: boolean;
    readActions: boolean;
    writeActions: boolean;
    readIssues: boolean;
    writeIssues: boolean;
    readStatuses: boolean;
    writeStatuses: boolean;
    readDeployments: boolean;
    writeDeployments: boolean;
    readAdministration: boolean;
    writeAdministration: boolean;
    writeWorkflows: boolean;
  }>;
}

function permissionAllowsRead(level: string | undefined): boolean {
  return level === "read" || level === "write";
}

function permissionAllowsWrite(level: string | undefined): boolean {
  return level === "write";
}

function sortedPermissionNames(
  permissions: Readonly<Record<string, string>>,
  predicate: (level: string | undefined) => boolean,
): readonly string[] {
  return Object.freeze(
    Object.entries(permissions)
      .filter(([, level]) => predicate(level))
      .map(([name]) => name)
      .sort(),
  );
}

/**
 * Converts GitHub's provider-observed installation permission map into the
 * bounded capabilities FCR is allowed to reason about. Raw permissions are
 * retained so new GitHub permissions can be surfaced without pretending FCR
 * already has an implementation for them.
 */
export function deriveGitHubAppRepositoryCapabilities(
  evidence: GitHubRepositoryInstallationEvidence,
): GitHubAppRepositoryCapabilityContract {
  const permissions = evidence.permissions;

  return {
    repository: evidence.repository,
    appId: evidence.appId,
    installationId: evidence.installationId,
    repositorySelection: evidence.repositorySelection,
    permissions,
    readablePermissions: sortedPermissionNames(permissions, permissionAllowsRead),
    writablePermissions: sortedPermissionNames(permissions, permissionAllowsWrite),
    can: Object.freeze({
      readContents: permissionAllowsRead(permissions.contents),
      writeContents: permissionAllowsWrite(permissions.contents),
      readPullRequests: permissionAllowsRead(permissions.pull_requests),
      writePullRequests: permissionAllowsWrite(permissions.pull_requests),
      readChecks: permissionAllowsRead(permissions.checks),
      writeChecks: permissionAllowsWrite(permissions.checks),
      readActions: permissionAllowsRead(permissions.actions),
      writeActions: permissionAllowsWrite(permissions.actions),
      readIssues: permissionAllowsRead(permissions.issues),
      writeIssues: permissionAllowsWrite(permissions.issues),
      readStatuses: permissionAllowsRead(permissions.statuses),
      writeStatuses: permissionAllowsWrite(permissions.statuses),
      readDeployments: permissionAllowsRead(permissions.deployments),
      writeDeployments: permissionAllowsWrite(permissions.deployments),
      readAdministration: permissionAllowsRead(permissions.administration),
      writeAdministration: permissionAllowsWrite(permissions.administration),
      writeWorkflows: permissionAllowsWrite(permissions.workflows),
    }),
  };
}

/**
 * Fails before token minting or provider mutation when GitHub has not granted
 * the installation every permission required by the requested operation.
 */
export function requireGitHubAppRepositoryPermissions(
  contract: GitHubAppRepositoryCapabilityContract,
  required: Readonly<Record<string, GitHubAppRequiredPermissionLevel>>,
): void {
  const missing: string[] = [];

  for (const [name, requiredLevel] of Object.entries(required)) {
    const observedLevel = contract.permissions[name];
    const allowed = requiredLevel === "write"
      ? permissionAllowsWrite(observedLevel)
      : permissionAllowsRead(observedLevel);
    if (!allowed) {
      missing.push(`${name}:${requiredLevel} (observed ${observedLevel ?? "none"})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `GitHub App installation ${contract.installationId} lacks required repository permissions for ${contract.repository}: ${missing.join(", ")}`,
    );
  }
}
