import { describe, expect, it, vi } from "vitest";
import {
  createAppAwareRepositoryProvider,
  createCapabilityAwareAppRepositoryProvider,
  createRepositoryProvider,
  normalizeRepositoryConnection,
} from "./RepositoryProviderFactory.js";
import { L99_REPOSITORY_IDENTIFIER } from "../config/l99Repository.js";


describe("RepositoryProviderFactory", () => {
  it("normalizes the legacy project-row shape", () => {
    expect(
      normalizeRepositoryConnection({
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      }),
    ).toEqual({
      projectId: "sekret-bip",
      provider: "github",
      repository: "jussray/Sekret-Bip",
    });
  });

  it("normalizes the project_connections shape", () => {
    expect(
      normalizeRepositoryConnection({
        slug: "l99",
        provider: "github",
        connectionConfig: { repository: L99_REPOSITORY_IDENTIFIER },
      }),
    ).toMatchObject({ repository: L99_REPOSITORY_IDENTIFIER });
  });

  it("rejects malformed repository locators", () => {
    expect(() =>
      normalizeRepositoryConnection({
        slug: "bad",
        provider: "github",
        connectionConfig: { repository: "not-a-repository" },
      }),
    ).toThrow(/owner\/repo/);
  });

  it("requires the provider credential without exposing it", () => {
    expect(() =>
      createRepositoryProvider(
        {
          slug: "sekret-bip",
          repoProvider: "github",
          repoIdentifier: "jussray/Sekret-Bip",
        },
        {},
      ),
    ).toThrow("GITHUB_TOKEN is not set");

    expect(
      createRepositoryProvider(
        {
          slug: "sekret-bip",
          repoProvider: "github",
          repoIdentifier: "jussray/Sekret-Bip",
        },
        { GITHUB_TOKEN: "test-only-token" },
      ).name,
    ).toBe("github");
  });

  it("prefers a repository-scoped GitHub App installation token when production credentials exist", async () => {
    const getInstallationToken = vi.fn().mockResolvedValue("installation-token");
    const provider = await createAppAwareRepositoryProvider(
      {
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      },
      {
        GITHUB_APP_ID: "123456",
        GITHUB_PRIVATE_KEY: "test-private-key",
        GITHUB_TOKEN: "local-fallback-that-must-not-win",
      },
      { getInstallationToken },
    );

    expect(getInstallationToken).toHaveBeenCalledWith(
      "123456",
      "test-private-key",
      "jussray/Sekret-Bip",
    );
    expect(provider.name).toBe("github");
  });

  it("fails closed for a partial GitHub App configuration instead of silently using a fallback token", async () => {
    await expect(createAppAwareRepositoryProvider(
      {
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      },
      {
        GITHUB_APP_ID: "123456",
        GITHUB_TOKEN: "local-fallback-that-must-not-win",
      },
    )).rejects.toThrow("GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together");
  });

  it("proves live App permissions before returning mutation-capable provider authority", async () => {
    const observeInstallation = vi.fn().mockResolvedValue({
      repository: "jussray/Sekret-Bip",
      appId: "123456",
      installationId: "444",
      repositorySelection: "selected",
      permissions: {
        contents: "write",
        pull_requests: "write",
        checks: "read",
      },
      accountLogin: "jussray",
      accountType: "User",
    });
    const getInstallationToken = vi.fn().mockResolvedValue("installation-token");

    const result = await createCapabilityAwareAppRepositoryProvider(
      {
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      },
      {
        contents: "write",
        pull_requests: "write",
        checks: "read",
      },
      {
        GITHUB_APP_ID: "123456",
        GITHUB_PRIVATE_KEY: "test-private-key",
        GITHUB_TOKEN: "fallback-must-not-authorize-this-path",
      },
      { observeInstallation, getInstallationToken },
    );

    expect(observeInstallation).toHaveBeenCalledWith(
      "123456",
      "test-private-key",
      "jussray/Sekret-Bip",
    );
    expect(getInstallationToken).toHaveBeenCalledWith(
      "123456",
      "test-private-key",
      "jussray/Sekret-Bip",
    );
    expect(result.provider.name).toBe("github");
    expect(result.authority).toMatchObject({
      repository: "jussray/Sekret-Bip",
      appId: "123456",
      installationId: "444",
      can: {
        writeContents: true,
        writePullRequests: true,
        readChecks: true,
      },
    });
  });

  it("refuses App provider construction before token minting when a required permission is missing", async () => {
    const observeInstallation = vi.fn().mockResolvedValue({
      repository: "jussray/Sekret-Bip",
      appId: "123456",
      installationId: "444",
      repositorySelection: "selected",
      permissions: { contents: "read" },
    });
    const getInstallationToken = vi.fn().mockResolvedValue("must-not-be-used");

    await expect(createCapabilityAwareAppRepositoryProvider(
      {
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      },
      { contents: "write" },
      {
        GITHUB_APP_ID: "123456",
        GITHUB_PRIVATE_KEY: "test-private-key",
      },
      { observeInstallation, getInstallationToken },
    )).rejects.toThrow(/contents:write \(observed read\)/);

    expect(getInstallationToken).not.toHaveBeenCalled();
  });

  it("never allows the capability-aware App path to fall back to an ambient token", async () => {
    await expect(createCapabilityAwareAppRepositoryProvider(
      {
        slug: "sekret-bip",
        repoProvider: "github",
        repoIdentifier: "jussray/Sekret-Bip",
      },
      { contents: "read" },
      { GITHUB_TOKEN: "ambient-token" },
    )).rejects.toThrow(/requires GITHUB_APP_ID and GITHUB_PRIVATE_KEY/);
  });
});
