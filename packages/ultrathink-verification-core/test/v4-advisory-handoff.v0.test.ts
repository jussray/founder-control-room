import { describe, expect, it } from "vitest";
import {
  createV4AdvisoryHandoffFromReceiptV0,
  createV4AdvisoryHandoffV0,
} from "../src/v4-advisory-handoff.v0";

const subjectHash = "a".repeat(64);
const observationHash = "b".repeat(64);

function v4Receipt(overrides: Record<string, unknown> = {}) {
  return {
    contract: "fcr/founder-content-supersession@v4",
    subject: {
      platform: "linkedin",
      post_fingerprint: "post-123",
    },
    evidence: [
      { evidence_state: "ATTESTED_HISTORICAL" },
      { evidence_state: "ATTESTED_CURRENT" },
    ],
    supersession: {
      current_claim_state: "ATTESTED_CURRENT",
    },
    source_binding: {
      contract: "sha256-source-bytes-v4",
    },
    provenance: {
      verification_ceiling: "ATTESTED",
    },
    receipt_sha256: "c".repeat(64),
    metrics_that_must_not_cross: { impressions: 999 },
    claim_that_must_not_cross: "private internal claim",
    ...overrides,
  };
}

describe("V4 advisory handoff", () => {
  it("is deterministic, sanitized, and capped at ATTESTED", () => {
    const first = createV4AdvisoryHandoffV0({ subjectHash, observationHash });
    const second = createV4AdvisoryHandoffV0({ subjectHash, observationHash });

    expect(first).toEqual(second);
    expect(first.evidenceLevel).toBe("ATTESTED");
    expect(Object.keys(first).sort()).toEqual(
      ["evidenceLevel", "learningHash", "observationHash", "schema", "subjectHash"].sort(),
    );
    expect(first.learningHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects non-digest inputs instead of laundering raw evidence", () => {
    expect(() =>
      createV4AdvisoryHandoffV0({
        subjectHash: "raw source bytes",
        observationHash,
      }),
    ).toThrow(/subjectHash/);
  });

  it("derives the sanitized handoff from a real ATTESTED V4 receipt", () => {
    const handoff = createV4AdvisoryHandoffFromReceiptV0(v4Receipt());

    expect(handoff.evidenceLevel).toBe("ATTESTED");
    expect(handoff.observationHash).toBe("c".repeat(64));
    expect(handoff.subjectHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(handoff).sort()).toEqual(
      ["evidenceLevel", "learningHash", "observationHash", "schema", "subjectHash"].sort(),
    );
    expect(JSON.stringify(handoff)).not.toContain("impressions");
    expect(JSON.stringify(handoff)).not.toContain("private internal claim");
  });

  it("rejects V4 receipts that attempt to exceed the ATTESTED ceiling", () => {
    expect(() =>
      createV4AdvisoryHandoffFromReceiptV0(v4Receipt({
        provenance: { verification_ceiling: "VERIFIED" },
      })),
    ).toThrow(/ATTESTED verification ceiling/);

    expect(() =>
      createV4AdvisoryHandoffFromReceiptV0(v4Receipt({
        supersession: { current_claim_state: "VERIFIED_CURRENT" },
      })),
    ).toThrow(/ATTESTED_CURRENT/);
  });
});
