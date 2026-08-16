import { describe, expect, it, vi } from "vitest";
import { GitLabProvider } from "../GitLabProvider.js";
import { providerForProject } from "../providerFactory.js";

const PROJECT_ID = "control-room";
const LOCATOR = "founder/control-room";
const HEAD = "a".repeat(40);
const MERGED = "b".repeat(40);
const LAST_COMMIT = "c".repeat(40);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function provider(fetchImpl: typeof fetch): GitLabProvider {
  return new GitLabProvider({
    token: "test-token",
    projectMap: { [PROJECT_ID]: LOCATOR },
    baseUrl: "https://gitlab.example.com",
    fetchImpl,
  });
}

describe("GitLabProvider", () => {
  it("maps GitLab project, file, ref, and commit-status evidence into provider-neutral shapes", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      expect(url.toString()).not.toContain("test-token");
      expect((init?.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("test-token");

      if (method === "GET" && url.pathname.endsWith("/api/v4/projects/founder%2Fcontrol-room")) {
        return jsonResponse({
          name: "control-room",
          path_with_namespace: LOCATOR,
          default_branch: "main",
          archived: false,
          empty_repo: false,
        });
      }

      if (method === "GET" && url.pathname.endsWith("/repository/tree")) {
        return jsonResponse([
          { path: "src", type: "tree" },
          { path: "README.md", type: "blob" },
        ]);
      }

      if (method === "GET" && url.pathname.endsWith("/repository/files/README.md")) {
        return jsonResponse({
          file_path: "README.md",
          size: 5,
          encoding: "base64",
          content: Buffer.from("hello").toString("base64"),
          last_commit_id: LAST_COMMIT,
        });
      }

      if (method === "GET" && url.pathname.endsWith("/repository/commits/main")) {
        return jsonResponse({ id: HEAD, committed_date: "2026-08-16T10:00:00Z" });
      }

      if (method === "GET" && url.pathname.endsWith(`/repository/commits/${HEAD}/statuses`)) {
        return jsonResponse([
          {
            id: 11,
            name: "test",
            sha: HEAD,
            status: "success",
            created_at: "2026-08-16T10:00:01Z",
            started_at: "2026-08-16T10:00:02Z",
            finished_at: "2026-08-16T10:00:03Z",
            target_url: "https://gitlab.example.com/jobs/11",
          },
          {
            id: 12,
            name: "deploy",
            sha: HEAD,
            status: "canceled",
            created_at: "2026-08-16T10:00:04Z",
            started_at: null,
            finished_at: "2026-08-16T10:00:05Z",
            target_url: null,
          },
        ]);
      }

      throw new Error(`Unexpected ${method} ${url}`);
    }) as unknown as typeof fetch;

    const gitlab = provider(fetchImpl);

    await expect(gitlab.getProject(PROJECT_ID)).resolves.toEqual({
      projectId: PROJECT_ID,
      name: "control-room",
      provider: "gitlab",
      defaultBranch: "main",
      locator: LOCATOR,
      isActive: true,
    });
    await expect(gitlab.listFiles(PROJECT_ID, "main")).resolves.toEqual([
      { path: "src", type: "dir" },
      { path: "README.md", type: "file" },
    ]);
    await expect(gitlab.readFile(PROJECT_ID, "main", "README.md")).resolves.toBe("hello");
    await expect(gitlab.getRef(PROJECT_ID, "main")).resolves.toEqual({
      name: "main",
      commitSha: HEAD,
      committedAt: "2026-08-16T10:00:00Z",
    });
    await expect(gitlab.listVerificationSignals(PROJECT_ID, "main")).resolves.toEqual([
      {
        id: "11",
        name: "test",
        status: "passed",
        commitSha: HEAD,
        provider: "gitlab",
        startedAt: "2026-08-16T10:00:02Z",
        completedAt: "2026-08-16T10:00:03Z",
        detailsUrl: "https://gitlab.example.com/jobs/11",
      },
      {
        id: "12",
        name: "deploy",
        status: "cancelled",
        commitSha: HEAD,
        provider: "gitlab",
        startedAt: "2026-08-16T10:00:04Z",
        completedAt: "2026-08-16T10:00:05Z",
        detailsUrl: undefined,
      },
    ]);
  });

  it("commits create, update, and delete actions atomically with last-known file commit guards", async () => {
    let commitBody: Record<string, unknown> | undefined;

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname.endsWith("/repository/files/new.txt")) {
        return jsonResponse({ message: "404 File Not Found" }, 404);
      }
      if (method === "GET" && url.pathname.endsWith("/repository/files/existing.txt")) {
        return jsonResponse({
          file_path: "existing.txt",
          size: 3,
          encoding: "base64",
          content: Buffer.from("old").toString("base64"),
          last_commit_id: LAST_COMMIT,
        });
      }
      if (method === "GET" && url.pathname.endsWith("/repository/files/remove.txt")) {
        return jsonResponse({
          file_path: "remove.txt",
          size: 3,
          encoding: "base64",
          content: Buffer.from("bye").toString("base64"),
          last_commit_id: LAST_COMMIT,
        });
      }
      if (method === "POST" && url.pathname.endsWith("/repository/commits")) {
        commitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ id: HEAD }, 201);
      }

      throw new Error(`Unexpected ${method} ${url}`);
    }) as unknown as typeof fetch;

    const gitlab = provider(fetchImpl);
    const result = await gitlab.commitPatch(PROJECT_ID, "mission", {
      message: "apply bounded mission patch",
      authorName: "Founder Control Room",
      authorEmail: "fcr@example.com",
      changes: [
        { path: "new.txt", content: "new" },
        { path: "existing.txt", content: "changed" },
        { path: "remove.txt", delete: true },
      ],
    });

    expect(result).toBe(HEAD);
    expect(commitBody).toEqual({
      branch: "mission",
      commit_message: "apply bounded mission patch",
      author_name: "Founder Control Room",
      author_email: "fcr@example.com",
      actions: [
        { action: "create", file_path: "new.txt", content: "new" },
        {
          action: "update",
          file_path: "existing.txt",
          content: "changed",
          last_commit_id: LAST_COMMIT,
        },
        { action: "delete", file_path: "remove.txt", last_commit_id: LAST_COMMIT },
      ],
    });
  });

  it("returns structured compare evidence and fails closed when GitLab truncates the file diff", async () => {
    let truncate = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      if (url.pathname.endsWith("/repository/compare") && from === "main" && to === "feature") {
        return jsonResponse({
          commits: [{ id: "1" }, { id: "2" }],
          diffs: [
            {
              old_path: "src/a.ts",
              new_path: "src/a.ts",
              diff: truncate ? "" : "@@ -1 +1,2 @@\n-old\n+new\n+second",
              collapsed: false,
              too_large: truncate,
              new_file: false,
              renamed_file: false,
              deleted_file: false,
            },
          ],
          compare_timeout: false,
          compare_same_ref: false,
        });
      }
      if (url.pathname.endsWith("/repository/compare") && from === "feature" && to === "main") {
        return jsonResponse({
          commits: [{ id: "3" }],
          diffs: [],
          compare_timeout: false,
          compare_same_ref: false,
        });
      }

      throw new Error(`Unexpected GET ${url}`);
    }) as unknown as typeof fetch;

    const gitlab = provider(fetchImpl);
    await expect(gitlab.compare(PROJECT_ID, "main", "feature")).resolves.toEqual({
      base: "main",
      head: "feature",
      files: [
        {
          path: "src/a.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          patch: "@@ -1 +1,2 @@\n-old\n+new\n+second",
        },
      ],
      aheadBy: 2,
      behindBy: 1,
    });

    truncate = true;
    await expect(gitlab.compare(PROJECT_ID, "main", "feature")).rejects.toThrow(/incomplete file diffs/);
  });

  it("binds integration to the exact resolved source SHA before GitLab can merge", async () => {
    const calls: Array<{ method: string; url: URL; body?: Record<string, unknown> }> = [];

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ method, url, body });

      if (method === "GET" && url.pathname.endsWith("/repository/branches/feature")) {
        return jsonResponse({ name: "feature", commit: { id: HEAD } });
      }
      if (method === "POST" && url.pathname.endsWith("/merge_requests")) {
        return jsonResponse({ iid: 7, sha: HEAD, state: "opened" }, 201);
      }
      if (method === "PUT" && url.pathname.endsWith("/merge_requests/7/merge")) {
        return jsonResponse({ iid: 7, sha: HEAD, state: "merged", merge_commit_sha: MERGED });
      }
      if (method === "GET" && url.pathname.endsWith("/repository/commits/main")) {
        return jsonResponse({ id: MERGED, committed_date: "2026-08-16T10:10:00Z" });
      }

      throw new Error(`Unexpected ${method} ${url}`);
    }) as unknown as typeof fetch;

    const gitlab = provider(fetchImpl);
    await expect(gitlab.integrate(PROJECT_ID, "main", "feature")).rejects.toThrow(/requires resolveRef/);
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(gitlab.resolveRef(PROJECT_ID, "feature")).resolves.toBe(HEAD);
    await expect(gitlab.integrate(PROJECT_ID, "main", "feature")).resolves.toBe(MERGED);

    const createMr = calls.find((call) => call.method === "POST" && call.url.pathname.endsWith("/merge_requests"));
    expect(createMr?.body).toMatchObject({ source_branch: "feature", target_branch: "main" });

    const merge = calls.find((call) => call.method === "PUT" && call.url.pathname.endsWith("/merge_requests/7/merge"));
    expect(merge?.body).toEqual({ sha: HEAD, should_remove_source_branch: false });
  });

  it("closes the adapter-created merge request when its source head no longer matches the resolved SHA", async () => {
    const STALE = "d".repeat(40);
    let closeBody: Record<string, unknown> | undefined;

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname.endsWith("/repository/branches/feature")) {
        return jsonResponse({ name: "feature", commit: { id: HEAD } });
      }
      if (method === "POST" && url.pathname.endsWith("/merge_requests")) {
        return jsonResponse({ iid: 9, sha: STALE, state: "opened" }, 201);
      }
      if (method === "PUT" && url.pathname.endsWith("/merge_requests/9")) {
        closeBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ iid: 9, sha: STALE, state: "closed" });
      }

      throw new Error(`Unexpected ${method} ${url}`);
    }) as unknown as typeof fetch;

    const gitlab = provider(fetchImpl);
    await gitlab.resolveRef(PROJECT_ID, "feature");
    await expect(gitlab.integrate(PROJECT_ID, "main", "feature")).rejects.toThrow(/head changed/);
    expect(closeBody).toEqual({ state_event: "close" });
  });

  it("routes GitLab projects through the lazy provider factory without touching GitHub auth", () => {
    const selected = providerForProject({
      repo_provider: "gitlab",
      slug: PROJECT_ID,
      repo_identifier: LOCATOR,
    });

    expect(selected.name).toBe("gitlab");
  });

  it("deletes branches through the GitLab branch endpoint", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "DELETE" && url.pathname.endsWith("/repository/branches/mission%2Fone")) {
        return noContentResponse();
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    }) as unknown as typeof fetch;

    await expect(provider(fetchImpl).deleteBranch(PROJECT_ID, "mission/one")).resolves.toBeUndefined();
  });
});
