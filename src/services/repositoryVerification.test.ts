import { describe, expect, it } from "vitest";
import type {
  Diff,
  FileEntry,
  Patch,
  ProjectRepo,
  RepositoryProvider,
  RepositoryRef,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  inspectRepositoryManifest,
  parseRepositoryManifest,
  type RegistryProjectIdentity,
} from "./repositoryVerification.js";
import { REPOSITORY_MANIFEST_PATH } from "../types/repositoryVerification.js";

const project: RegistryProjectIdentity = {
  slug: "example-project",
  repo_provider: "github",
  repo_identifier: "founder/example-project",
};

function manifest(evidencePaths = ["src/index.ts"]): string {
  return JSON.stringify({
    schemaVersion: "1.0",
    projectId: project.slug,
    repository: {
      provider: project.repo_provider,
      identifier: project.repo_identifier,
      defaultBranch: "main",
    },
    verification: {
      requiredSignals: [{ id: "typecheck", name: "Type check", required: true }],
    },
    capabilities: [{
      id: "working-code",
      description: "Example capability",
      status: "active",
      evidencePaths,
      requiredSignals: ["typecheck"],
    }],
    buildAssist: { enabled: true, preferredBuilder: "codex", riskLevel: "medium" },
    privacy: {
      allowlistedPacketFields: ["commitSha", "checks.status"],
      forbiddenData: ["user content", "secrets"],
    },
  });
}

class FakeProvider implements RepositoryProvider {
  readonly name = "github";

  constructor(
    private readonly files: Record<string, string>,
    private readonly signals: VerificationSignal[],
  ) {}

  async getProject(projectId: string): Promise<ProjectRepo> {
    return {
      projectId,
      name: "example-project",
      provider: this.name,
      defaultBranch: "main",
      locator: project.repo_identifier,
      isActive: true,
    };
  }

  async listFiles(): Promise<FileEntry[]> { return []; }

  async readFile(_projectId: string, _ref: string, path: string): Promise<string> {
    const content = this.files[path];
    if (content === undefined) throw new Error(`missing:${path}`);
    return content;
  }

  async getRef(): Promise<RepositoryRef> {
    return { name: "main", commitSha: "a".repeat(40), committedAt: "2026-07-15T00:00:00Z" };
  }

  async listVerificationSignals(): Promise<VerificationSignal[]> { return this.signals; }

  async createBranch(): Promise<string> { throw new Error("not used"); }
  async commitPatch(_projectId: string, _branch: string, _patch: Patch): Promise<string> { throw new Error("not used"); }
  async compare(): Promise<Diff> { throw new Error("not used"); }
  async integrate(): Promise<string> { throw new Error("not used"); }
  async deleteBranch(): Promise<void> { throw new Error("not used"); }
}

const passingSignal: VerificationSignal = {
  id: "1",
  name: "Type check",
  status: "passed",
  commitSha: "a".repeat(40),
  provider: "github",
};

describe("repository manifest contract", () => {
  it("accepts a manifest only when repo identity matches the registry", () => {
    const parsed = parseRepositoryManifest(manifest(), project);
    expect(parsed.valid).toBe(true);
    expect(parsed.manifest?.projectId).toBe(project.slug);
  });

  it("rejects a manifest that tries to identify as another repository", () => {
    const decoded = JSON.parse(manifest());
    decoded.repository.identifier = "attacker/other-repo";
    const parsed = parseRepositoryManifest(JSON.stringify(decoded), project);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(" ")).toContain(project.repo_identifier);
  });

  it("rejects capability claims tied to undeclared verification signals", () => {
    const decoded = JSON.parse(manifest());
    decoded.capabilities[0].requiredSignals = ["not-declared"];
    const parsed = parseRepositoryManifest(JSON.stringify(decoded), project);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(" ")).toContain("unknown signal");
  });
});

describe("exact-commit repository inspection", () => {
  it("verifies a capability only when its code path and required check both exist", async () => {
    const provider = new FakeProvider({
      [REPOSITORY_MANIFEST_PATH]: manifest(),
      "src/index.ts": "export const ready = true;",
    }, [passingSignal]);

    const result = await inspectRepositoryManifest(provider, project);
    expect(result.overallStatus).toBe("passed");
    expect(result.commitSha).toBe("a".repeat(40));
    expect(result.capabilities[0]?.observedStatus).toBe("verified");
  });

  it("pings drift when a claimed active capability has no code evidence", async () => {
    const provider = new FakeProvider({
      [REPOSITORY_MANIFEST_PATH]: manifest(["src/missing.ts"]),
    }, [passingSignal]);

    const result = await inspectRepositoryManifest(provider, project);
    expect(result.overallStatus).toBe("failed");
    expect(result.capabilities[0]?.observedStatus).toBe("drifted");
    expect(result.capabilities[0]?.missingEvidencePaths).toEqual(["src/missing.ts"]);
  });
});
