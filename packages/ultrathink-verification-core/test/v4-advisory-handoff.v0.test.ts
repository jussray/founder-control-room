import { describe, expect, it } from "vitest";
import {
  createV4AdvisoryHandoffFromReceiptV0,
  createV4AdvisoryHandoffV0,
} from "../src/v4-advisory-handoff.v0";

const subjectHash = "a".repeat(64);
const observationHash = "b".repeat(64);
const receiptSha256 = "c".repeat(64);
const priorSourceSha256 = "d".repeat(64);
const currentSourceSha256 = "e".repeat(64);

function v4Receipt(overrides: Record<string, unknown> = {}) {
  return {
    contract: "fcr/founder-content-supersession@v4",
    authority: "observation_only",
    canonicalization: "fcr-json-v1",
    subject: {
      platform: "linkedin",
      post_fingerprint: "post-123",
    },
    evidence: [
      {
        observed_at: "2026-08-30T12:00:00Z",
        source_sha256: priorSourceSha256,
        evidence_state: "ATTESTED_HISTORICAL",
        metrics: { impressions: 100, engagements: 10 },
      },
      {
        observed_at: "2026-08-31T12:00:00Z",
        source_sha256: currentSourceSha256,
        evidence_state: "ATTESTED_CURRENT",
        metrics: { impressions: 200, engagements: 25 },
      },
    ],
    supersession: {
      current_claim_state: "ATTESTED_CURRENT",
      current_claim: "private current claim",
    },
    source_binding: {
      contract: "sha256-source-bytes-v4",
      prior: {
        source_sha256: priorSourceSha256,
        binding_state: "SOURCE_BYTES_MATCH_HISTORICAL",
      },
      current: {
        source_sha256: currentSourceSha256,
        binding_state: "SOURCE_BYTES_MATCH_CURRENT",
      },
    },
    provenance: {
      source_digest_verification: "VERIFIED_FROM_SOURCE_BYTES_V4",
      source_artifact_binding: "LOCKED_TO_SOURCE_BYTES_V4",
      claim_source_binding: "NOT_PROVEN_V4",
      metric_derivation_verification: "NOT_PROVEN_V4",
      independent_witness: "NOT_PRESENT_V4",
      execution_environment_attestation: "NOT_LOCKED_V4",
      verification_ceiling: "ATTESTED",
    },
    receipt_id: `SUP-${receiptSha256.slice(0, 16)}`,
    receipt_sha256: receiptSha256,
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

  it("derives a sanitized ATTESTED handoff from the validated V4 projection", () => {
    const handoff = createV4AdvisoryHandoffFromReceiptV0(v4Receipt());

    expect(handoff.evidenceLevel).toBe("ATTESTED");
    expect(handoff.observationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(handoff.observationHash).not.toBe(receiptSha256);
    expect(handoff.subjectHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(handoff).sort()).toEqual(
      ["evidenceLevel", "learningHash", "observationHash", "schema", "subjectHash"].sort(),
    );
    expect(JSON.stringify(handoff)).not.toContain("impressions");
    expect(JSON.stringify(handoff)).not.toContain("private internal claim");
    expect(JSON.stringify(handoff)).not.toContain("private current claim");
  });

  it("does not let unproven metrics change the advisory identity", () => {
    const first = createV4AdvisoryHandoffFromReceiptV0(v4Receipt());
    const changed = v4Receipt();
    (changed.evidence as Array<Record<string, unknown>>)[1].metrics = { impressions: 999999, engagements: 0 };
    changed.metrics_that_must_not_cross = { impressions: 1 };

    expect(createV4AdvisoryHandoffFromReceiptV0(changed)).toEqual(first);
  });

  describe("Attack Ten", () => {
    it("1 rejects an authority upgrade", () => {
      expect(() => createV4AdvisoryHandoffFromReceiptV0(v4Receipt({ authority: "publish" })))
        .toThrow(/observation_only/);
    });

    it("2 rejects canonicalization drift", () => {
      expect(() => createV4AdvisoryHandoffFromReceiptV0(v4Receipt({ canonicalization: "caller-json" })))
        .toThrow(/canonicalization/);
    });

    it("3 rejects a verification-ceiling upgrade", () => {
      const receipt = v4Receipt();
      (receipt.provenance as Record<string, unknown>).verification_ceiling = "VERIFIED";
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/ATTESTED verification ceiling/);
    });

    it("4 rejects source-digest verification downgrade", () => {
      const receipt = v4Receipt();
      (receipt.provenance as Record<string, unknown>).source_digest_verification = "UNVERIFIED_INPUT_V3";
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/source digest verification/);
    });

    it("5 rejects an attempt to claim source derivation is proven", () => {
      const receipt = v4Receipt();
      (receipt.provenance as Record<string, unknown>).claim_source_binding = "VERIFIED";
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/must remain unproven/);
    });

    it("6 rejects spoofed current source-byte binding state", () => {
      const receipt = v4Receipt();
      const sourceBinding = receipt.source_binding as Record<string, unknown>;
      (sourceBinding.current as Record<string, unknown>).binding_state = "SOURCE_BYTES_UNCHECKED";
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/current source bytes are not bound/);
    });

    it("7 rejects evidence/source-binding digest disagreement", () => {
      const receipt = v4Receipt();
      (receipt.evidence as Array<Record<string, unknown>>)[1].source_sha256 = "f".repeat(64);
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/evidence\/source binding digest mismatch/);
    });

    it("8 rejects receipt-id and receipt-digest disagreement", () => {
      expect(() => createV4AdvisoryHandoffFromReceiptV0(v4Receipt({ receipt_id: "SUP-deadbeefdeadbeef" })))
        .toThrow(/id\/digest linkage mismatch/);
    });

    it("9 rejects evidence-list injection instead of trusting the last element", () => {
      const receipt = v4Receipt();
      (receipt.evidence as Array<Record<string, unknown>>).splice(1, 0, {
        observed_at: "2026-08-30T18:00:00Z",
        source_sha256: "f".repeat(64),
        evidence_state: "VERIFIED_CURRENT",
      });
      expect(() => createV4AdvisoryHandoffFromReceiptV0(receipt))
        .toThrow(/exactly historical and current evidence/);
    });

    it("10 prevents a replayed receipt digest from freezing changed accepted evidence", () => {
      const original = createV4AdvisoryHandoffFromReceiptV0(v4Receipt());
      const changed = v4Receipt();
      const newCurrentDigest = "f".repeat(64);
      (changed.evidence as Array<Record<string, unknown>>)[1].source_sha256 = newCurrentDigest;
      const sourceBinding = changed.source_binding as Record<string, unknown>;
      (sourceBinding.current as Record<string, unknown>).source_sha256 = newCurrentDigest;

      const replayed = createV4AdvisoryHandoffFromReceiptV0(changed);
      expect(replayed.observationHash).not.toBe(original.observationHash);
      expect(replayed.learningHash).not.toBe(original.learningHash);
    });
  });
});
