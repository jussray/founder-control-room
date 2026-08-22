import { describe, expect, it } from "vitest";
import { validateAuthorityReceipt } from "./authorityReceipt.js";

const baseReceipt = {
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

describe("authority receipt", () => {
  it("accepts valid receipts", () => {
    expect(validateAuthorityReceipt(baseReceipt).ok).toBe(true);
  });

  it("blocks expired receipts", () => {
    expect(
      validateAuthorityReceipt(baseReceipt, new Date("2026-08-24T00:00:00.000Z")),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("blocks receipts without evidence", () => {
    expect(
      validateAuthorityReceipt({ ...baseReceipt, evidenceRefs: [] }),
    ).toEqual({ ok: false, reason: "missing_evidence" });
  });
});
