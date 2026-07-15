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
import { REPOSITORY_MANIFEST_PATH } from "../types/repositoryVerification.js";
import {
  inspectRepositoryManifest,
  parseRepositoryManifest,
  type RegistryProjectIdentity,
} from "./repositoryVerification.js";

const project: RegistryProjectIdentity = {
  slug: "example-project",
  repo_provider: "github",
  repo_identifier: "founder/example-project",
};

function manifest(
  evidencePaths = ["src/index.ts"],
  usageAssertions: Array<Record<string, string>> = [],
): string {
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
      usageAssertions,
    }],
    buildAssist: {
      enabled: true,
      preferredBuilder: "codex",
      riskLevel: "medium",
    },
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

  async listFiles(): Promise<FileEntry[]> {
    return [];
  }

  async readFile(
    _projectId: string,
    _ref: string,
    path: string,
  ): Promise<string> {
    const content = this.files[path];
    if (content === undefined) throw new Error(`missing:${path}`);
    return content;
  }

  async getRef(): Promise<RepositoryRef> {
    return {
      name: "main",
      commitSha: "a".repeat(40),
      committedAt: "2026-07-15T00:00:00Z",
    };
  }

  async listVerificationSignals(): Promise<VerificationSignal[]> {
    return this.signals;
  }

  async createBranch(): Promise<string> {
    throw new Error("not used");
  }

  async commitPatch(
    _projectId: string,
    _branch: string,
    _patch: Patch,
  ): Promise<string> {
    throw new Error("not used");
  }

  async compare(): Promise<Diff> {
    throw new Error("not used");
  }

  async integrate(): Promise<string> {
    throw new Error("not used");
  }

  async deleteBranch(): Promise<void> {
    throw new Error("not used");
  }
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

  it("rejects unsafe or multiline usage assertions", () => {
    const unsafe = parseRepositoryManifest(manifest(
      ["src/index.ts"],
      [{ id: "wired", path: "../secret.ts", marker: "ready" }],
    ), project);
    expect(unsafe.valid).toBe(false);
    expect(unsafe.errors.join(" ")).toContain("safe repository-relative path");

    const multiline = parseRepositoryManifest(manifest(
      ["src/index.ts"],
      [{ id: "wired", path: "src/app.ts", marker: "line one\nline two" }],
    ), project);
    expect(multiline.valid).toBe(false);
    expect(multiline.errors.join(" ")).toContain("single-line value");
  });
});

describe("exact-commit repository inspection", () => {
  it("verifies a capability when evidence, check, and usage marker all match", async () => {
    const provider = new FakeProvider({
      [REPOSITORY_MANIFEST_PATH]: manifest(
        ["src/index.ts"],
        [{ id: "entrypoint-import", path: "src/app.ts", marker: "./index.js" }],
      ),
      "src/index.ts": "export const ready = true;",
      "src/app.ts": 'import { ready } from "./index.js";',
    }, [passingSignal]);

    const result = await inspectRepositoryManifest(provider, project);
    expect(result.overallStatus).toBe("passed");
    expect(result.commitSha).toBe("a".repeat(40));
    expect(result.capabilities[0]?.observedStatus).toBe("verified");
    expect(result.capabilities[0]?.usageAssertions).toEqual([{
      id: "entrypoint-import",
      path: "src/app.ts",
      passed: true,
      reason: "matched",
    }]);
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

  it("pings drift when evidence exists but is not wired into its entrypoint", async () => {
    const provider = new FakeProvider({
      [REPOSITORY_MANIFEST_PATH]: manifest(
        ["src/index.ts"],
        [{ id: "entrypoint-import", path: "src/app.ts", marker: "./index.js" }],
      ),
      "src/index.ts": "export const ready = true;",
      "src/app.ts": "export const unrelated = true;",
    }, [passingSignal]);

    const result = await inspectRepositoryManifest(provider, project);
    expect(result.overallStatus).toBe("failed");
    expect(result.capabilities[0]?.observedStatus).toBe("drifted");
    expect(result.capabilities[0]?.failedUsageAssertionIds).toEqual([
      "entrypoint-import",
    ]);
    expect(result.capabilities[0]?.reason).toContain("failed usage assertions");
  });
});
