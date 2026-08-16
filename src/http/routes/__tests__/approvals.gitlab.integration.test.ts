import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  supabaseMock,
  mockProviderForProject,
  mockProviderConfigurationError,
  mockResolveRef,
  mockCreateBranch,
  mockCommitPatch,
  mockEnqueue,
  mockControllerRun,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockProviderForProject: vi.fn(),
  mockProviderConfigurationError: vi.fn(),
  mockResolveRef: vi.fn(),
  mockCreateBranch: vi.fn(),
  mockCommitPatch: vi.fn(),
  mockEnqueue: vi.fn(),
  mockControllerRun: vi.fn(),
}));

vi.mock("../../../lib/supabaseAuthClient.js", () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock("../../../lib/supabaseClient.js", () => ({ supabase: supabaseMock }));
vi.mock("../../../providers/providerFactory.js", () => ({
  providerConfigurationError: mockProviderConfigurationError,
  providerForProject: mockProviderForProject,
}));
vi.mock("../../../events/outbox.js", () => ({ enqueueReconcile: mockEnqueue }));
vi.mock("../../../controllers/ProofGateController.js", () => ({
  ProofGateController: class MockProofGateController {
    run = mockControllerRun;
  },
}));

import express from "express";
import request from "supertest";
import { approvalsRouter } from "../approvals.js";

const MISSION_ID = "mission-gitlab-001";
const PROJECT_ID = "project-gitlab-001";
const EXECUTION_ID = "execution-gitlab-001";
const FOUNDER_EMAIL = "founder@example.com";
const BEARER = "Bearer gitlab-test-token";
const HEAD = "a".repeat(40);
const GITLAB_PROJECT = {
  id: PROJECT_ID,
  slug: "gitlab-project",
  repo_provider: "gitlab",
  repo_identifier: "founder/gitlab-project",
};

const validEvidence = {
  filesChanged: ["src/example.ts"],
  behaviorChanged: "Exact-head verification completed.",
  checksRun: ["typecheck"],
  failures: [],
  securityImpact: "none",
  deploymentImpact: "none",
  rollbackPath: "Revert the integration commit.",
  unresolvedRisks: [],
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/approvals", approvalsRouter);
  return instance;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function twoEqUpdate(error: { message: string } | null = null) {
  return { eq: () => ({ eq: () => Promise.resolve({ error }) }) };
}

function configureProvider() {
  mockProviderConfigurationError.mockReturnValue(null);
  mockResolveRef.mockResolvedValue(HEAD);
  mockCreateBranch.mockResolvedValue("mission/gitlab");
  mockCommitPatch.mockResolvedValue(HEAD);
  mockProviderForProject.mockReturnValue({
    name: "gitlab",
    resolveRef: mockResolveRef,
    createBranch: mockCreateBranch,
    commitPatch: mockCommitPatch,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "founder-user", email: FOUNDER_EMAIL } },
    error: null,
  });
  configureProvider();
});

describe("GitLab approvals routing", () => {
  it("pins a GitLab mission merge approval to the provider-resolved exact head", async () => {
    mockControllerRun.mockResolvedValue({
      status: "converged",
      proposedActions: [],
      observedChanges: [],
      evidenceIds: [],
      requiresApproval: false,
    });

    let updatedFields: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "founder_users") return founderUsersRow();
      if (table === "missions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  id: MISSION_ID,
                  project_id: PROJECT_ID,
                  status: "in_review",
                  branch_ref: "mission/gitlab",
                  policy_snapshot: { preserved: true },
                },
                error: null,
              }),
            }),
          }),
          update: (fields: Record<string, unknown>) => {
            updatedFields = fields;
            return twoEqUpdate();
          },
        };
      }
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: GITLAB_PROJECT, error: null }) }),
          }),
        };
      }
      return {};
    });

    const response = await request(app())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set("Authorization", BEARER)
      .send({ gateId: "merge", evidence: validEvidence });

    expect(response.status).toBe(200);
    expect(mockProviderConfigurationError).toHaveBeenCalledWith({
      repo_provider: "gitlab",
      slug: "gitlab-project",
      repo_identifier: "founder/gitlab-project",
    });
    expect(mockProviderForProject).toHaveBeenCalledWith({
      repo_provider: "gitlab",
      slug: "gitlab-project",
      repo_identifier: "founder/gitlab-project",
    });
    expect(mockResolveRef).toHaveBeenCalledWith("gitlab-project", "mission/gitlab");
    expect(updatedFields).toMatchObject({
      status: "approved",
      policy_snapshot: { preserved: true, expectedHeadSha: HEAD },
    });
  });

  it("creates a GitLab mission branch through the provider factory after reserving the approved action", async () => {
    let insertedReservation = false;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "founder_users") return founderUsersRow();
      if (table === "missions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  id: MISSION_ID,
                  project_id: PROJECT_ID,
                  status: "proposed",
                  branch_ref: null,
                  required_checks: ["typecheck"],
                  policy_snapshot: {},
                },
                error: null,
              }),
            }),
          }),
          update: () => twoEqUpdate(),
        };
      }
      if (table === "proof_gate_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => Promise.resolve({ data: { id: "proof", status: "pass" }, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "approval_executions") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: () => {
            insertedReservation = true;
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: EXECUTION_ID }, error: null }) }),
            };
          },
          update: () => twoEqUpdate(),
        };
      }
      if (table === "projects") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: GITLAB_PROJECT, error: null }) }) }),
        };
      }
      return {};
    });

    const response = await request(app())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set("Authorization", BEARER)
      .send({
        actionType: "create_branch",
        idempotencyKey: "gitlab-create-branch",
        payload: { branchName: "mission/gitlab", baseRef: "main" },
      });

    expect(response.status).toBe(200);
    expect(insertedReservation).toBe(true);
    expect(mockCreateBranch).toHaveBeenCalledWith("gitlab-project", "main", "mission/gitlab");
    expect(mockResolveRef).toHaveBeenCalledWith("gitlab-project", "mission/gitlab");
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
  });

  it("patches a GitLab sandbox branch through the same provider boundary", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "founder_users") return founderUsersRow();
      if (table === "missions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  id: MISSION_ID,
                  project_id: PROJECT_ID,
                  status: "sandboxed",
                  branch_ref: "mission/gitlab",
                  policy_snapshot: {},
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "projects") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: GITLAB_PROJECT, error: null }) }) }),
        };
      }
      if (table === "project_events") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });

    const response = await request(app())
      .post(`/approvals/${MISSION_ID}/patch`)
      .set("Authorization", BEARER)
      .send({ message: "edit via GitLab", changes: [{ path: "src/example.ts", content: "export const ok = true;" }] });

    expect(response.status).toBe(201);
    expect(mockCommitPatch).toHaveBeenCalledWith(
      "gitlab-project",
      "mission/gitlab",
      expect.objectContaining({
        message: "edit via GitLab",
        authorName: "founder-control-room",
      }),
    );
  });

  it("fails before reserving work when GitLab credentials are not configured", async () => {
    mockProviderConfigurationError.mockReturnValue("GitLab authentication is not configured; set GITLAB_TOKEN");
    const reservationInsert = vi.fn();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "founder_users") return founderUsersRow();
      if (table === "missions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  id: MISSION_ID,
                  project_id: PROJECT_ID,
                  status: "proposed",
                  branch_ref: null,
                  required_checks: ["typecheck"],
                  policy_snapshot: {},
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "proof_gate_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => Promise.resolve({ data: { id: "proof", status: "pass" }, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "approval_executions") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: reservationInsert,
        };
      }
      if (table === "projects") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: GITLAB_PROJECT, error: null }) }) }),
        };
      }
      return {};
    });

    const response = await request(app())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set("Authorization", BEARER)
      .send({ actionType: "create_branch", idempotencyKey: "gitlab-missing-token", payload: {} });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("REPOSITORY_PROVIDER_UNAVAILABLE");
    expect(reservationInsert).not.toHaveBeenCalled();
    expect(mockCreateBranch).not.toHaveBeenCalled();
  });
});
