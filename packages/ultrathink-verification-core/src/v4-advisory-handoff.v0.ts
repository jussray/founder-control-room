import { createHash } from "node:crypto";

export type V4AdvisoryEvidenceLevel = "ATTESTED";

export interface V4AdvisoryHandoffV0 {
  schema: "ultrathink/v4-advisory-handoff@v0";
  evidenceLevel: V4AdvisoryEvidenceLevel;
  subjectHash: string;
  observationHash: string;
  learningHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

  if (!/^[a-f0-9]{64}$/.test(subjectHash)) {
    throw new Error("subjectHash must be a sha256 hex digest");
  }
  if (!/^[a-f0-9]{64}$/.test(observationHash)) {
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
