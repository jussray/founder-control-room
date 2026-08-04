import { describe, expect, it } from "vitest";
import {
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
});
