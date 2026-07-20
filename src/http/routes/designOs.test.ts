import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../middleware/requireFounder.js", () => ({
  requireFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { designOsRouter } = await import("./designOs.js");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/design-os", designOsRouter);
  return app;
}

describe("Portfolio Design OS API", () => {
  it("returns all readiness dimensions without promoting design to runtime proof", async () => {
    const response = await request(createTestApp()).get("/design-os");

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalProjects: 7,
      registeredFigmaFiles: 1,
      designReadyProjects: 0,
      exactHeadVerifiedProjects: 0,
      deployedObservedProjects: 0,
      codeConnectCompleteProjects: 0,
      driftDetectedProjects: 0,
      unregisteredProjects: 6,
      truthState: "valid",
    });
    expect(response.body.truthBoundaries).toEqual({
      figmaIsNotRuntimeProof: true,
      designApprovalDoesNotAuthorizeImplementation: true,
      implementationDoesNotAuthorizeDeployment: true,
      noApprovalCarriesAcrossProjects: true,
    });
    expect(response.body.projects).toHaveLength(7);
  });

  it("returns the registered Command Center file with a not-started implementation state", async () => {
    const response = await request(createTestApp()).get("/design-os/founder-control-room");

    expect(response.status).toBe(200);
    expect(response.body.project.figma.fileKey).toBe("QevLkXHXSzXfEsqsZltGRJ");
    expect(response.body.project.designState).toBe("registered");
    expect(response.body.project.implementationState).toBe("not_started");
    expect(response.body.project.codeConnectMappings).toBe(0);
  });

  it("fails closed for an unknown repository instead of falling back", async () => {
    const response = await request(createTestApp()).get("/design-os/not-a-real-project");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "DESIGN_OS_PROJECT_NOT_FOUND",
      slug: "not-a-real-project",
    });
    expect(response.text).not.toContain("QevLkXHXSzXfEsqsZltGRJ");
  });
});
