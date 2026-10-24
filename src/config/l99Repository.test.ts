import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  L99_GIT_CONNECTION_LABEL,
  L99_GIT_CONNECTION_TYPE,
  L99_PROJECT_SLUG,
  L99_REPOSITORY_IDENTIFIER,
  L99_REPOSITORY_PROVIDER,
  buildL99GitConnectionConfig,
  buildL99RepositoryFields,
  needsL99GitConnectionReconciliation,
  needsL99RepositoryReconciliation,
} from "./l99Repository.js";

const STALE_REPOSITORY_IDENTIFIER = "jussray/" + "l99-StoryEngine";
const ACTIVE_ROUTING_FILES = [
  "../../AGENTS.md",
  "../../docs/REPO_STACK_POLICY.md",
  "../../docs/FIGMA_PORTFOLIO_CONTRACT.md",
  "../../docs/REPOSITORY_PRIVACY_PROGRAM.md",
] as const;
const CONNECTION_RECONCILIATION_MIGRATION = readFileSync(
  new URL(
    "../../supabase/migrations/20260920215300_reconcile_storyengine_git_connection_identity.sql",
    import.meta.url,
  ),
  "utf8",
);
const L99_ROUTE = readFileSync(new URL("../http/routes/l99.ts", import.meta.url), "utf8");

describe("L99 repository identity", () => {
  it("keeps the stable project slug separate from the repository locator", () => {
    expect(L99_PROJECT_SLUG).toBe("l99");
    expect(L99_REPOSITORY_PROVIDER).toBe("github");
    expect(L99_REPOSITORY_IDENTIFIER).toBe("jussray/StoryEngine");
    expect(L99_GIT_CONNECTION_TYPE).toBe("git");
    expect(L99_GIT_CONNECTION_LABEL).toBe("primary");
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

  it("keeps active portfolio routing on the authoritative StoryEngine repository", () => {
    for (const relativePath of ACTIVE_ROUTING_FILES) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(content).toContain(L99_REPOSITORY_IDENTIFIER);
      expect(content).not.toContain(STALE_REPOSITORY_IDENTIFIER);
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

  it("builds the exact idempotent project-row patch", () => {
    expect(buildL99RepositoryFields("2026-08-04T05:30:00.000Z")).toEqual({
      repo_provider: "github",
      repo_identifier: "jussray/StoryEngine",
      updated_at: "2026-08-04T05:30:00.000Z",
    });
  });

  it("detects stale primary Git connection config", () => {
    expect(
      needsL99GitConnectionReconciliation({ repository: L99_REPOSITORY_IDENTIFIER }),
    ).toBe(false);
    expect(
      needsL99GitConnectionReconciliation({ repository: STALE_REPOSITORY_IDENTIFIER }),
    ).toBe(true);
    expect(needsL99GitConnectionReconciliation({})).toBe(true);
    expect(needsL99GitConnectionReconciliation(null)).toBe(true);
  });

  it("repairs only the repository key and preserves existing connection config", () => {
    expect(
      buildL99GitConnectionConfig({
        repository: STALE_REPOSITORY_IDENTIFIER,
        manifest_path: "control-room.manifest.json",
        default_branch: "main",
        observation_mode: "sanitized_read_only",
      }),
    ).toEqual({
      repository: L99_REPOSITORY_IDENTIFIER,
      manifest_path: "control-room.manifest.json",
      default_branch: "main",
      observation_mode: "sanitized_read_only",
    });
  });

  it("ships an idempotent database repair for the existing primary Git connection", () => {
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("public.project_connections");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("p.slug = 'l99'");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("pc.connection_type = 'git'");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("pc.label = 'primary'");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("pc.status = 'active'");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("jsonb_set");
    expect(CONNECTION_RECONCILIATION_MIGRATION).toContain("jussray/StoryEngine");
    expect(CONNECTION_RECONCILIATION_MIGRATION).not.toContain("4e7e9fca-90e6-46d4-a5cc-cb0759909008");
  });

  it("keeps the seed route from claiming parity while its Git connection is stale or missing", () => {
    for (const required of [
      "getL99GitConnection",
      "needsL99GitConnectionReconciliation",
      "buildL99GitConnectionConfig",
      "L99_GIT_CONNECTION_MISSING",
      "git_connection_reconciled",
    ]) {
      expect(L99_ROUTE).toContain(required);
    }
    expect(L99_ROUTE).toContain(".from('project_connections')");
  });
});
