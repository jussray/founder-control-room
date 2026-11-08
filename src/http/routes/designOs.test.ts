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
  it("returns all readiness dimensions and the shared 23-command design deck without promoting design to runtime proof", async () => {
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
    expect(response.body.commands).toHaveLength(23);
    expect(response.body.commandContract).toMatchObject({
      contract: "juss/design-command-deck@v1",
      count: 23,
      sharedCapability: "control-room-design-implementation",
      commandsAreOperationsNotAuthority: true,
      mutatingCommandsRequireFounderApproval: true,
      uiRuntimeClaimsRequireExactHeadPlaywright: true,
    });
  });

  it("returns the registered Command Center file with a not-started implementation state and the same command deck", async () => {
    const response = await request(createTestApp()).get("/design-os/founder-control-room");

    expect(response.status).toBe(200);
    expect(response.body.project.figma.fileKey).toBe("QevLkXHXSzXfEsqsZltGRJ");
    expect(response.body.project.designState).toBe("registered");
    expect(response.body.project.implementationState).toBe("not_started");
    expect(response.body.project.codeConnectMappings).toBe(0);
    expect(response.body.commands).toHaveLength(23);
    expect(response.body.commandContract.sharedCapability).toBe("control-room-design-implementation");
  });

  it("exposes exactly 23 bounded commands and can resolve one by id", async () => {
    const deck = await request(createTestApp()).get("/design-os/commands");
    const layout = await request(createTestApp()).get("/design-os/commands/layout");

    expect(deck.status).toBe(200);
    expect(deck.body.commands).toHaveLength(23);
    expect(deck.body.commands.map((entry: { slash: string }) => entry.slash)).toContain("/prove");
    expect(layout.status).toBe(200);
    expect(layout.body.command).toMatchObject({
      id: "layout",
      slash: "/layout",
      phase: "expression",
      mode: "mutate",
      requiresFounderApproval: true,
      requiresPlaywright: true,
    });
    expect(layout.body.command.owns).toContain("structural placement");
  });

  it("fails closed for an unknown design command", async () => {
    const response = await request(createTestApp()).get("/design-os/commands/make-it-pretty");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "DESIGN_COMMAND_NOT_FOUND",
      commandId: "make-it-pretty",
    });
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
