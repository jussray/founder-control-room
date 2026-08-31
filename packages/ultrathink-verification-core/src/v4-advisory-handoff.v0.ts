import { createHash } from "node:crypto";

export type V4AdvisoryEvidenceLevel = "ATTESTED";

export interface V4AdvisoryHandoffV0 {
  schema: "ultrathink/v4-advisory-handoff@v0";
  evidenceLevel: V4AdvisoryEvidenceLevel;
  subjectHash: string;
  observationHash: string;
  learningHash: string;
}

const SHA256 = /^[a-f0-9]{64}$/;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

/**
 * Produces a deterministic, sanitized advisory handoff for downstream consumers.
 * This object is evidence only. It never grants execution or publication authority
 * and intentionally cannot represent evidence stronger than ATTESTED.
 */
export function createV4AdvisoryHandoffV0(input: {
  subjectHash: string;
  observationHash: string;
}): V4AdvisoryHandoffV0 {
  const subjectHash = input.subjectHash.trim().toLowerCase();
  const observationHash = input.observationHash.trim().toLowerCase();

  if (!SHA256.test(subjectHash)) {
    throw new Error("subjectHash must be a sha256 hex digest");
  }
  if (!SHA256.test(observationHash)) {
    throw new Error("observationHash must be a sha256 hex digest");
  }

  return {
    schema: "ultrathink/v4-advisory-handoff@v0",
    evidenceLevel: "ATTESTED",
    subjectHash,
    observationHash,
    learningHash: sha256(
      `ultrathink/v4-advisory-handoff@v0\n${subjectHash}\n${observationHash}\nATTESTED`,
    ),
  };
}

/**
 * Convert the real ACTUAL-FLOW V4 receipt into the sanitized cross-repo handoff.
 * The receipt itself, source bytes, claims, and metrics never cross this boundary.
 */
export function createV4AdvisoryHandoffFromReceiptV0(receipt: unknown): V4AdvisoryHandoffV0 {
  const value = asRecord(receipt, "V4 receipt");
  if (value.contract !== "fcr/founder-content-supersession@v4") {
    throw new Error("V4 receipt contract mismatch");
  }

  const provenance = asRecord(value.provenance, "V4 receipt provenance");
  if (provenance.verification_ceiling !== "ATTESTED") {
    throw new Error("V4 receipt exceeds ATTESTED verification ceiling");
  }

  const sourceBinding = asRecord(value.source_binding, "V4 receipt source_binding");
  if (sourceBinding.contract !== "sha256-source-bytes-v4") {
    throw new Error("V4 receipt source binding contract mismatch");
  }

  const supersession = asRecord(value.supersession, "V4 receipt supersession");
  if (supersession.current_claim_state !== "ATTESTED_CURRENT") {
    throw new Error("V4 receipt current claim must remain ATTESTED_CURRENT");
  }

  if (!Array.isArray(value.evidence) || value.evidence.length < 2) {
    throw new Error("V4 receipt must contain historical and current evidence");
  }
  const currentEvidence = asRecord(value.evidence[value.evidence.length - 1], "V4 current evidence");
  if (currentEvidence.evidence_state !== "ATTESTED_CURRENT") {
    throw new Error("V4 current evidence must remain ATTESTED_CURRENT");
  }

  const subject = asRecord(value.subject, "V4 receipt subject");
  const platform = requiredText(subject.platform, "V4 receipt subject.platform").toLowerCase();
  const postFingerprint = requiredText(subject.post_fingerprint, "V4 receipt subject.post_fingerprint");
  const receiptSha256 = requiredText(value.receipt_sha256, "V4 receipt receipt_sha256").toLowerCase();
  if (!SHA256.test(receiptSha256)) {
    throw new Error("V4 receipt receipt_sha256 must be a sha256 hex digest");
  }

  return createV4AdvisoryHandoffV0({
    subjectHash: sha256(`fcr/founder-content-v4-subject@v0\n${platform}\n${postFingerprint}`),
    observationHash: receiptSha256,
  });
}
