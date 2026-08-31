import { createHash } from "node:crypto";
import { canonicalSerialize } from "./canonical-serialize.js";

export type V4AdvisoryEvidenceLevel = "ATTESTED";

export interface V4AdvisoryHandoffV0 {
  schema: "ultrathink/v4-advisory-handoff@v0";
  evidenceLevel: V4AdvisoryEvidenceLevel;
  subjectHash: string;
  observationHash: string;
  learningHash: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^SUP-([a-f0-9]{16})$/i;

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

function requiredDigest(value: unknown, label: string): string {
  const digest = requiredText(value, label).toLowerCase();
  if (!SHA256.test(digest)) {
    throw new Error(`${label} must be a sha256 hex digest`);
  }
  return digest;
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
 * Convert an ACTUAL-FLOW V4 receipt into the sanitized cross-repo handoff.
 *
 * The caller-supplied receipt_sha256 is treated as receipt metadata, not as the
 * handoff's integrity root. The handoff observation hash is derived locally from
 * the exact validated V4 advisory projection, so changing any accepted boundary
 * field changes the learning identity even if receipt_sha256 is replayed.
 *
 * The receipt itself, source bytes, claims, and metrics never cross this boundary.
 */
export function createV4AdvisoryHandoffFromReceiptV0(receipt: unknown): V4AdvisoryHandoffV0 {
  const value = asRecord(receipt, "V4 receipt");
  if (value.contract !== "fcr/founder-content-supersession@v4") {
    throw new Error("V4 receipt contract mismatch");
  }
  if (value.authority !== "observation_only") {
    throw new Error("V4 receipt authority must remain observation_only");
  }
  if (value.canonicalization !== "fcr-json-v1") {
    throw new Error("V4 receipt canonicalization contract mismatch");
  }

  const provenance = asRecord(value.provenance, "V4 receipt provenance");
  if (provenance.verification_ceiling !== "ATTESTED") {
    throw new Error("V4 receipt exceeds ATTESTED verification ceiling");
  }
  if (provenance.source_digest_verification !== "VERIFIED_FROM_SOURCE_BYTES_V4") {
    throw new Error("V4 receipt source digest verification mismatch");
  }
  if (provenance.source_artifact_binding !== "LOCKED_TO_SOURCE_BYTES_V4") {
    throw new Error("V4 receipt source artifact binding mismatch");
  }
  if (provenance.claim_source_binding !== "NOT_PROVEN_V4") {
    throw new Error("V4 receipt claim/source derivation must remain unproven");
  }
  if (provenance.metric_derivation_verification !== "NOT_PROVEN_V4") {
    throw new Error("V4 receipt metric derivation must remain unproven");
  }
  if (provenance.independent_witness !== "NOT_PRESENT_V4") {
    throw new Error("V4 receipt independent witness contract mismatch");
  }
  if (provenance.execution_environment_attestation !== "NOT_LOCKED_V4") {
    throw new Error("V4 receipt execution environment attestation mismatch");
  }

  const sourceBinding = asRecord(value.source_binding, "V4 receipt source_binding");
  if (sourceBinding.contract !== "sha256-source-bytes-v4") {
    throw new Error("V4 receipt source binding contract mismatch");
  }
  const priorBinding = asRecord(sourceBinding.prior, "V4 receipt source_binding.prior");
  const currentBinding = asRecord(sourceBinding.current, "V4 receipt source_binding.current");
  const priorSourceDigest = requiredDigest(
    priorBinding.source_sha256,
    "V4 receipt source_binding.prior.source_sha256",
  );
  const currentSourceDigest = requiredDigest(
    currentBinding.source_sha256,
    "V4 receipt source_binding.current.source_sha256",
  );
  if (priorBinding.binding_state !== "SOURCE_BYTES_MATCH_HISTORICAL") {
    throw new Error("V4 receipt historical source bytes are not bound");
  }
  if (currentBinding.binding_state !== "SOURCE_BYTES_MATCH_CURRENT") {
    throw new Error("V4 receipt current source bytes are not bound");
  }

  const supersession = asRecord(value.supersession, "V4 receipt supersession");
  if (supersession.current_claim_state !== "ATTESTED_CURRENT") {
    throw new Error("V4 receipt current claim must remain ATTESTED_CURRENT");
  }

  if (!Array.isArray(value.evidence) || value.evidence.length !== 2) {
    throw new Error("V4 receipt must contain exactly historical and current evidence");
  }
  const priorEvidence = asRecord(value.evidence[0], "V4 historical evidence");
  const currentEvidence = asRecord(value.evidence[1], "V4 current evidence");
  if (priorEvidence.evidence_state !== "ATTESTED_HISTORICAL") {
    throw new Error("V4 historical evidence must remain ATTESTED_HISTORICAL");
  }
  if (currentEvidence.evidence_state !== "ATTESTED_CURRENT") {
    throw new Error("V4 current evidence must remain ATTESTED_CURRENT");
  }
  if (requiredDigest(priorEvidence.source_sha256, "V4 historical evidence source_sha256") !== priorSourceDigest) {
    throw new Error("V4 historical evidence/source binding digest mismatch");
  }
  if (requiredDigest(currentEvidence.source_sha256, "V4 current evidence source_sha256") !== currentSourceDigest) {
    throw new Error("V4 current evidence/source binding digest mismatch");
  }

  const subject = asRecord(value.subject, "V4 receipt subject");
  const platform = requiredText(subject.platform, "V4 receipt subject.platform").toLowerCase();
  const postFingerprint = requiredText(subject.post_fingerprint, "V4 receipt subject.post_fingerprint");
  const receiptSha256 = requiredDigest(value.receipt_sha256, "V4 receipt receipt_sha256");
  const receiptIdRaw = requiredText(value.receipt_id, "V4 receipt receipt_id");
  const receiptIdMatch = RECEIPT_ID.exec(receiptIdRaw);
  if (!receiptIdMatch) {
    throw new Error("V4 receipt id/digest linkage mismatch");
  }
  const receiptId = `SUP-${receiptIdMatch[1].toLowerCase()}`;
  if (receiptId !== `SUP-${receiptSha256.slice(0, 16)}`) {
    throw new Error("V4 receipt id/digest linkage mismatch");
  }

  const subjectHash = sha256(canonicalSerialize({
    schema: "fcr/founder-content-v4-subject@v0",
    platform,
    postFingerprint,
  }));
  const observationHash = sha256(canonicalSerialize({
    schema: "fcr/founder-content-v4-advisory-projection@v0",
    contract: value.contract,
    authority: value.authority,
    canonicalization: value.canonicalization,
    subject: {
      platform,
      postFingerprint,
    },
    evidence: [
      {
        observedAt: requiredText(priorEvidence.observed_at, "V4 historical evidence observed_at"),
        sourceSha256: priorSourceDigest,
        evidenceState: priorEvidence.evidence_state,
      },
      {
        observedAt: requiredText(currentEvidence.observed_at, "V4 current evidence observed_at"),
        sourceSha256: currentSourceDigest,
        evidenceState: currentEvidence.evidence_state,
      },
    ],
    sourceBinding: {
      contract: sourceBinding.contract,
      priorState: priorBinding.binding_state,
      priorSourceSha256: priorSourceDigest,
      currentState: currentBinding.binding_state,
      currentSourceSha256: currentSourceDigest,
    },
    supersession: {
      currentClaimState: supersession.current_claim_state,
    },
    provenance: {
      sourceDigestVerification: provenance.source_digest_verification,
      sourceArtifactBinding: provenance.source_artifact_binding,
      claimSourceBinding: provenance.claim_source_binding,
      metricDerivationVerification: provenance.metric_derivation_verification,
      independentWitness: provenance.independent_witness,
      executionEnvironmentAttestation: provenance.execution_environment_attestation,
      verificationCeiling: provenance.verification_ceiling,
    },
    receiptId,
    receiptSha256,
  }));

  return createV4AdvisoryHandoffV0({ subjectHash, observationHash });
}
