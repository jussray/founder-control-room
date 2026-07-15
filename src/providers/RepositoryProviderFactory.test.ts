import { describe, expect, it } from "vitest";
import {
  createRepositoryProvider,
  normalizeRepositoryConnection,
} from "./RepositoryProviderFactory.js";


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
        slug: "l99-story-engine",
        provider: "github",
        connectionConfig: { repository: "jussray/l99-StoryEngine" },
      }),
    ).toMatchObject({ repository: "jussray/l99-StoryEngine" });
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
