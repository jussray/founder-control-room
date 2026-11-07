import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoInstallation, mockCreateInstallationAccessToken } = vi.hoisted(() => ({
  mockGetRepoInstallation: vi.fn(),
  mockCreateInstallationAccessToken: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    apps = {
      getRepoInstallation: mockGetRepoInstallation,
      createInstallationAccessToken: mockCreateInstallationAccessToken,
    };
  },
}));

const { getGitHubInstallationToken } = await import("../githubAppAuth.js");

const REPOSITORY = "jussray/founder-control-room";

function statelessInstallationToken(): string {
  const segment = "A".repeat(170);
  return `ghs_${segment}.${segment}.${segment}`;
}

function privateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("getGitHubInstallationToken token-format compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoInstallation.mockResolvedValue({ data: { id: 4242, app_id: 12345 } });
  });

  it("treats a long JWT-shaped stateless installation token as an opaque credential", async () => {
    const token = statelessInstallationToken();
    mockCreateInstallationAccessToken.mockResolvedValue({
      data: {
        token,
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    });

    const resolved = await getGitHubInstallationToken(
      "12345",
      privateKeyPem(),
      REPOSITORY,
    );

    expect(resolved).toBe(token);
    expect(resolved.length).toBeGreaterThan(500);
    expect(resolved.split(".")).toHaveLength(3);
    expect(mockCreateInstallationAccessToken).toHaveBeenCalledWith({
      installation_id: 4242,
      repositories: ["founder-control-room"],
    });
  });
});
