import { describe, expect, it } from "vitest";
import { providerConfigurationError } from "../providerFactory.js";

const FCR_PROJECT = {
  repo_provider: "github",
  slug: "founder-control-room",
  repo_identifier: "jussray/founder-control-room",
};

const FCR_ALIAS_PROJECT = {
  repo_provider: "github",
  slug: "fcr-alias",
  repo_identifier: "JUSSRAY/FOUNDER-CONTROL-ROOM",
};

const OTHER_PROJECT = {
  repo_provider: "github",
  slug: "sekret-bip",
  repo_identifier: "jussray/Sekret-Bip",
};

describe("FCR GitHub App authentication boundary", () => {
  it("rejects token-only authentication for the constitutional FCR repository", () => {
    expect(providerConfigurationError(FCR_PROJECT, {
      GITHUB_TOKEN: "local-token",
    })).toMatch(/requires GITHUB_APP_ID and GITHUB_PRIVATE_KEY/i);
  });

  it("applies the same App requirement to case-insensitive FCR repository aliases", () => {
    expect(providerConfigurationError(FCR_ALIAS_PROJECT, {
      GITHUB_TOKEN: "local-token",
    })).toMatch(/GITHUB_TOKEN fallback is not accepted/i);
  });

  it("accepts a complete GitHub App credential pair for FCR", () => {
    expect(providerConfigurationError(FCR_PROJECT, {
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY: "test-private-key",
      GITHUB_TOKEN: "ignored-fallback",
    })).toBeNull();
  });

  it("rejects partial GitHub App credentials even if a token fallback exists", () => {
    expect(providerConfigurationError(FCR_PROJECT, {
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY: "",
      GITHUB_TOKEN: "local-token",
    })).toMatch(/GitHub App authentication is incomplete/i);
  });

  it("keeps the token fallback available for non-FCR local or development repositories", () => {
    expect(providerConfigurationError(OTHER_PROJECT, {
      GITHUB_TOKEN: "local-token",
    })).toBeNull();
  });
});
