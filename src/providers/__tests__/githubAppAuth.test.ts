import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGitHubAppJwt } from "../githubAppAuth.js";

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("GitHub App authentication", () => {
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
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const escaped = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString()
      .replace(/\n/g, "\\n");

    expect(() => createGitHubAppJwt("99", escaped)).not.toThrow();
  });

  it("rejects non-numeric app identifiers before signing", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => createGitHubAppJwt("github-app", privatePem)).toThrow(/numeric/);
  });
});
