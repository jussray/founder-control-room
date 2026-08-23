import { describe, expect, it } from "vitest";
import { AuthorityReceiptRegistry } from "./authorityReceiptRegistry.js";

const receipt = {
  id: "receipt-1",
  schemaVersion: "v1" as const,
  subject: { kind: "change" as const, id: "change-1" },
  issuer: { type: "human" as const, id: "founder" },
  action: { type: "deploy", target: "preview", digest: "sha256:test" },
  evidenceRefs: ["evidence-1"],
  issuedAt: "2026-08-22T00:00:00.000Z",
  expiresAt: "2026-08-23T00:00:00.000Z",
  status: "valid" as const,
};

describe("authority receipt registry", () => {
  it("allows one consumption", () => {
    const registry = new AuthorityReceiptRegistry();

    expect(registry.consume(receipt).ok).toBe(true);
  });

  it("blocks replay", () => {
    const registry = new AuthorityReceiptRegistry();

    registry.consume(receipt);

    expect(registry.consume(receipt)).toEqual({
      ok: false,
      reason: "already_consumed",
    });
  });
});
