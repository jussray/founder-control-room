import { createVerify, generateKeyPairSync } from "node:crypto";
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

const {
  createGitHubAppJwt,
  getGitHubInstallationToken,
  observeGitHubRepositoryInstallation,
} = await import("../githubAppAuth.js");

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

function generatePrivatePem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function installation(appId: number, id = 321) {
  return {
    data: {
      id,
      app_id: appId,
      repository_selection: "selected",
      permissions: { checks: "write", contents: "read" },
      account: { login: "jussray", type: "User" },
    },
  };
}

describe("GitHub App authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a short-lived RS256 app JWT with a numeric issuer", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const nowMs = Date.parse("2026-07-15T12:00:00Z");
    const token = createGitHubAppJwt("123456", privatePem, nowMs);
    const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

    expect(decodeJson(headerSegment)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeJson(payloadSegment)).toEqual({
      iat: Math.floor(nowMs / 1000) - 60,
      exp: Math.floor(nowMs / 1000) + 9 * 60,
      iss: "123456",
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerSegment}.${payloadSegment}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signatureSegment, "base64url"))).toBe(true);
  });

  it("normalizes escaped newlines used by secret stores", () => {
    const escaped = generatePrivatePem().replace(/\n/g, "\\n");
    expect(() => createGitHubAppJwt("99", escaped)).not.toThrow();
  });

  it("accepts a JSON-quoted PEM secret without exposing its contents", () => {
    const quoted = JSON.stringify(generatePrivatePem());
    expect(() => createGitHubAppJwt("99", quoted)).not.toThrow();
  });

  it("accepts a base64-encoded PEM secret", () => {
    const encoded = Buffer.from(generatePrivatePem(), "utf8").toString("base64");
    expect(() => createGitHubAppJwt("99", encoded)).not.toThrow();
  });

  it("accepts a base64url-encoded PEM secret", () => {
    const encoded = Buffer.from(generatePrivatePem(), "utf8").toString("base64url");
    expect(() => createGitHubAppJwt("99", encoded)).not.toThrow();
  });

  it("accepts base64-encoded PEM with CRLF line endings", () => {
    const encoded = Buffer.from(generatePrivatePem().replace(/\n/g, "\r\n"), "utf8").toString("base64");
    expect(() => createGitHubAppJwt("99", encoded)).not.toThrow();
  });

  it("accepts an accidentally single-quoted escaped PEM transport", () => {
    const quoted = `'${generatePrivatePem().replace(/\n/g, "\\n")}'`;
    expect(() => createGitHubAppJwt("99", quoted)).not.toThrow();
  });

  it("accepts a UTF-8 BOM before a raw PEM", () => {
    expect(() => createGitHubAppJwt("99", `\uFEFF${generatePrivatePem()}`)).not.toThrow();
  });

  it("fails closed with a configuration-safe error for malformed private-key secrets", () => {
    expect(() => createGitHubAppJwt("99", "not-a-private-key")).toThrow(
      /complete GitHub App RSA private-key PEM/,
    );
  });

  it("rejects non-RSA private keys before signing", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => createGitHubAppJwt("99", privatePem)).toThrow(/must be an RSA private key/);
  });

  it("rejects non-numeric app identifiers before signing", () => {
    expect(() => createGitHubAppJwt("github-app", generatePrivatePem())).toThrow(/numeric/);
  });

  it("observes repository installation identity and permissions without minting a token", async () => {
    mockGetRepoInstallation.mockResolvedValueOnce(installation(900001));

    await expect(observeGitHubRepositoryInstallation(
      "900001",
      generatePrivatePem(),
      "jussray/chief-ai-machine",
    )).resolves.toEqual({
      repository: "jussray/chief-ai-machine",
      appId: "900001",
      installationId: "321",
      repositorySelection: "selected",
      permissions: { checks: "write", contents: "read" },
      accountLogin: "jussray",
      accountType: "User",
    });

    expect(mockGetRepoInstallation).toHaveBeenCalledWith({ owner: "jussray", repo: "chief-ai-machine" });
    expect(mockCreateInstallationAccessToken).not.toHaveBeenCalled();
  });

  it("fails closed when provider installation identity does not match the authenticated App", async () => {
    mockGetRepoInstallation.mockResolvedValueOnce(installation(900002));

    await expect(observeGitHubRepositoryInstallation(
      "900001",
      generatePrivatePem(),
      "jussray/chief-ai-machine",
    )).rejects.toThrow(/app identity mismatch/);
  });

  it("keeps installation-token cache identity separate for different Apps on the same repository", async () => {
    mockGetRepoInstallation
      .mockResolvedValueOnce(installation(900101, 401))
      .mockResolvedValueOnce(installation(900102, 402));
    mockCreateInstallationAccessToken
      .mockResolvedValueOnce({ data: { token: "token-app-1", expires_at: "2099-01-01T00:00:00Z" } })
      .mockResolvedValueOnce({ data: { token: "token-app-2", expires_at: "2099-01-01T00:00:00Z" } });
    const key = generatePrivatePem();

    await expect(getGitHubInstallationToken(
      "900101",
      key,
      "jussray/chief-ai-machine",
    )).resolves.toBe("token-app-1");
    await expect(getGitHubInstallationToken(
      "900102",
      key,
      "jussray/chief-ai-machine",
    )).resolves.toBe("token-app-2");

    expect(mockGetRepoInstallation).toHaveBeenCalledTimes(2);
    expect(mockCreateInstallationAccessToken).toHaveBeenCalledTimes(2);
  });
});

describe("shared GitHub App wrapper transports", () => {
  it("signs the same payload with the same key across all bounded wrappers", () => {
    const pem = generatePrivatePem();
    const fence = String.fromCharCode(96).repeat(3);
    const now = Date.parse("2026-10-20T12:00:00Z");
    const expected = createGitHubAppJwt("99", pem, now);
    const wrappers = [
      fence + "pem\n" + pem.trim() + "\n" + fence,
      "APP_PRIVATE_KEY=" + pem.trim(),
      "APP_PRIVATE_KEY=" + JSON.stringify(pem),
      JSON.stringify({ APP_PRIVATE_KEY: pem }),
      JSON.stringify({ private_key: pem }),
      JSON.stringify({ privateKey: pem }),
      pem.replace(/\n/g, "\r"),
    ];
    for (const wrapper of wrappers) {
      expect(createGitHubAppJwt("99", wrapper, now)).toBe(expected);
    }
  });

  it("rejects ambiguous objects and malformed wrappers without echoing values", () => {
    const pem = generatePrivatePem();
    for (const value of [
      JSON.stringify({ APP_PRIVATE_KEY: pem, private_key: pem }),
      JSON.stringify({ private_key: 42 }),
      "APP_PRIVATE_KEY=invalid-secret-marker",
      "{invalid-secret-marker",
    ]) {
      let caught: unknown;
      try { createGitHubAppJwt("99", value); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).not.toContain(value);
      expect((caught as Error).message).not.toContain("invalid-secret-marker");
    }
  });

  it("preserves RSA-only rejection inside accepted JSON wrappers", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey
      .export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => createGitHubAppJwt("99", JSON.stringify({ private_key: ec })))
      .toThrow(/must be an RSA private key/);
  });
});
