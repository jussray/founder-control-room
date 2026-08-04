import { describe, expect, it } from "vitest";
import {
  L99_PROJECT_SLUG,
  L99_REPOSITORY_IDENTIFIER,
  L99_REPOSITORY_PROVIDER,
  buildL99RepositoryFields,
  needsL99RepositoryReconciliation,
} from "./l99Repository.js";

describe("L99 repository identity", () => {
  it("keeps the stable project slug separate from the repository locator", () => {
    expect(L99_PROJECT_SLUG).toBe("l99");
    expect(L99_REPOSITORY_PROVIDER).toBe("github");
    expect(L99_REPOSITORY_IDENTIFIER).toBe("jussray/StoryEngine");
  });

  it("accepts only the authoritative StoryEngine repository", () => {
    expect(
      needsL99RepositoryReconciliation({
        repo_provider: "github",
        repo_identifier: "jussray/StoryEngine",
      }),
    ).toBe(false);

    for (const repo_identifier of [
      "jussray/l99-",
      "jussray/l99-StoryEngine",
      null,
    ]) {
      expect(
        needsL99RepositoryReconciliation({
          repo_provider: "github",
          repo_identifier,
        }),
      ).toBe(true);
    }
  });

  it("repairs provider drift as well as repository drift", () => {
    expect(
      needsL99RepositoryReconciliation({
        repo_provider: "gitlab",
        repo_identifier: "jussray/StoryEngine",
      }),
    ).toBe(true);
  });

  it("builds the exact idempotent database patch", () => {
    expect(buildL99RepositoryFields("2026-08-04T05:30:00.000Z")).toEqual({
      repo_provider: "github",
      repo_identifier: "jussray/StoryEngine",
      updated_at: "2026-08-04T05:30:00.000Z",
    });
  });
});
