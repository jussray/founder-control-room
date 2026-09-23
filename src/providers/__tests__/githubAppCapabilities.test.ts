import { describe, expect, it } from "vitest";

import {
  deriveGitHubAppRepositoryCapabilities,
  requireGitHubAppRepositoryPermissions,
} from "../githubAppCapabilities.js";

const evidence = {
  repository: "jussray/founder-control-room",
  appId: "900001",
  installationId: "7654321",
  repositorySelection: "selected",
  permissions: {
    actions: "read",
    administration: "read",
    checks: "write",
    contents: "write",
    deployments: "write",
    issues: "write",
    pull_requests: "write",
    statuses: "read",
    workflows: "write",
  },
  accountLogin: "jussray",
  accountType: "User",
} as const;

describe("GitHub App repository capability contract", () => {
  it("derives bounded read/write capability flags from provider-observed permissions", () => {
    const contract = deriveGitHubAppRepositoryCapabilities(evidence);

    expect(contract).toMatchObject({
      repository: "jussray/founder-control-room",
      appId: "900001",
      installationId: "7654321",
      can: {
        readContents: true,
        writeContents: true,
        readPullRequests: true,
        writePullRequests: true,
        readChecks: true,
        writeChecks: true,
        readActions: true,
        writeActions: false,
        readIssues: true,
        writeIssues: true,
        readStatuses: true,
        writeStatuses: false,
        readDeployments: true,
        writeDeployments: true,
        readAdministration: true,
        writeAdministration: false,
        writeWorkflows: true,
      },
    });
    expect(contract.readablePermissions).toEqual([
      "actions",
      "administration",
      "checks",
      "contents",
      "deployments",
      "issues",
      "pull_requests",
      "statuses",
      "workflows",
    ]);
    expect(contract.writablePermissions).toEqual([
      "checks",
      "contents",
      "deployments",
      "issues",
      "pull_requests",
      "workflows",
    ]);
  });

  it("accepts write as satisfying a read requirement", () => {
    const contract = deriveGitHubAppRepositoryCapabilities(evidence);
    expect(() => requireGitHubAppRepositoryPermissions(contract, {
      contents: "read",
      checks: "write",
      administration: "read",
    })).not.toThrow();
  });

  it("fails closed when a requested write is only granted read", () => {
    const contract = deriveGitHubAppRepositoryCapabilities(evidence);
    expect(() => requireGitHubAppRepositoryPermissions(contract, {
      administration: "write",
      contents: "write",
    })).toThrow(/administration:write \(observed read\)/);
  });

  it("fails closed when GitHub did not grant a requested permission at all", () => {
    const contract = deriveGitHubAppRepositoryCapabilities(evidence);
    expect(() => requireGitHubAppRepositoryPermissions(contract, {
      security_events: "read",
    })).toThrow(/security_events:read \(observed none\)/);
  });
});
