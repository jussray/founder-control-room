import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, supabaseMock, mockApplyBranchRuleset, mockProviderForProject } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockApplyBranchRuleset: vi.fn(),
  mockProviderForProject: vi.fn(),
}));

vi.mock("../../../lib/supabaseAuthClient.js", () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock("../../../lib/supabaseClient.js", () => ({ supabase: supabaseMock }));
vi.mock("../../../providers/providerFactory.js", () => ({
  providerForProject: mockProviderForProject,
}));

import express from "express";
import request from "supertest";
import { projectsRouter } from "../projects.js";

const FOUNDER_EMAIL = "founder@example.com";
const BEARER = "Bearer test-token";
const PROJECT_SLUG = "founder-control-room";
const EXECUTION_ID = "execution-uuid-001";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: FOUNDER_EMAIL } }, error: null });
}

function founderUsersRow() {
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
  };
}

const validBody = {
  idempotencyKey: "ruleset-main-v1",
  name: "protect-main",
  enforcement: "active",
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Typecheck"],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [{ kind: "app", id: "123456" }],
};

interface RouteOptions {
  existingExecution?: { status: "pending" | "succeeded" | "failed"; result: Record<string, unknown>; id: string } | null;
  applyResult?: { id: string; name: string; enforcement: string };
  applyError?: Error;
  providerSupportsRuleset?: boolean;
}

function stubRoute(options: RouteOptions = {}) {
  authSuccess();
  const updateMock = vi.fn(() => ({ eq: () => Promise.resolve({ data: null, error: null }) }));
  const insertExecutionMock = vi.fn(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: { id: EXECUTION_ID }, error: null }),
    }),
  }));

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "founder_users") return founderUsersRow();
    if (table === "projects") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: "project-1", slug: PROJECT_SLUG, repo_provider: "github", repo_identifier: "jussray/founder-control-room" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "approval_executions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: options.existingExecution ?? null, error: null }),
          }),
        }),
        insert: insertExecutionMock,
        update: updateMock,
      };
    }
    if (table === "project_events") {
      return { insert: () => Promise.resolve({ data: null, error: null }) };
    }
    return {};
  });

  const provider = options.providerSupportsRuleset === false
    ? { name: "github" }
    : {
        name: "github",
        applyBranchRuleset: options.applyError
          ? mockApplyBranchRuleset.mockRejectedValue(options.applyError)
          : mockApplyBranchRuleset.mockResolvedValue(options.applyResult ?? { id: "1", name: "protect-main", enforcement: "active" }),
      };
  mockProviderForProject.mockReturnValue(provider);

  return { updateMock, insertExecutionMock };
}

describe("POST /projects/:slug/ruleset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects requests without a founder session", async () => {
    const res = await request(buildApp()).post(`/projects/${PROJECT_SLUG}/ruleset`).send(validBody);
    expect(res.status).toBe(401);
  });

  it("rejects a request missing idempotencyKey", async () => {
    stubRoute();
    const { idempotencyKey: _drop, ...withoutKey } = validBody;
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(withoutKey);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid enforcement value", async () => {
    stubRoute();
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send({ ...validBody, enforcement: "always-on" });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed bypass actor instead of silently dropping it", async () => {
    stubRoute();
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send({ ...validBody, bypassActors: [{ kind: "team" }] });
    expect(res.status).toBe(400);
  });

  it("returns 501 when the project's provider does not support rulesets", async () => {
    stubRoute({ providerSupportsRuleset: false });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);
    expect(res.status).toBe(501);
    expect(res.body.code).toBe("RULESET_NOT_SUPPORTED");
  });

  it("applies the ruleset and records a succeeded execution", async () => {
    const { updateMock } = stubRoute();
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockApplyBranchRuleset).toHaveBeenCalledWith(
      PROJECT_SLUG,
      expect.objectContaining({ name: "protect-main", bypassActors: validBody.bypassActors }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", success: true }),
    );
  });

  it("records a failed execution and returns 502 when the provider call throws", async () => {
    const { updateMock } = stubRoute({ applyError: new Error("insufficient permission: administration") });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/insufficient permission/);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", success: false }),
    );
  });

  it("returns the prior result idempotently without re-invoking the provider", async () => {
    stubRoute({ existingExecution: { id: EXECUTION_ID, status: "succeeded", result: { id: "1", name: "protect-main", enforcement: "active" } } });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(mockApplyBranchRuleset).not.toHaveBeenCalled();
  });

  it("rejects a retry while a prior attempt is still pending", async () => {
    stubRoute({ existingExecution: { id: EXECUTION_ID, status: "pending", result: {} } });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACTION_ALREADY_PENDING");
    expect(mockApplyBranchRuleset).not.toHaveBeenCalled();
  });
});
