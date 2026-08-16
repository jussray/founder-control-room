import { describe, expect, it } from "vitest";
import {
  providerConfigurationError,
  providerForProject,
  type ProviderProjectConfig,
} from "../providerFactory.js";

const project: ProviderProjectConfig = {
  repo_provider: "gitlab",
  slug: "control-room",
  repo_identifier: "founder/control-room",
};

describe("providerFactory GitLab configuration", () => {
  it("reports a missing GitLab token before a mutation route reserves work", () => {
    expect(providerConfigurationError(project, {})).toMatch(/GITLAB_TOKEN/);
  });

  it("accepts GitLab configuration without requiring any GitHub credential", () => {
    expect(providerConfigurationError(project, { GITLAB_TOKEN: "gitlab-token" })).toBeNull();
    expect(providerForProject(project).name).toBe("gitlab");
  });

  it("keeps unknown repository providers fail-closed", () => {
    const unknown = { ...project, repo_provider: "unknown-forge" };
    expect(providerConfigurationError(unknown, {})).toMatch(/No RepositoryProvider implementation/);
    expect(() => providerForProject(unknown)).toThrow(/No RepositoryProvider implementation/);
  });
});
