import type { VerificationSignal } from "../providers/RepositoryProvider.js";

export const REPOSITORY_MANIFEST_PATH = ".control-room/repository.manifest.json";
export const REPOSITORY_MANIFEST_SCHEMA_VERSION = "1.0";
export const REPOSITORY_PACKET_SCHEMA_VERSION = "1.0";

export interface RequiredSignalDeclaration {
  id: string;
  /** Exact provider check name, e.g. "Typecheck" or "Runtime Truth Contracts". */
  name: string;
  required?: boolean;
}

/**
 * Proves that declared code is wired into another repository file. `marker`
 * must be a short symbol/import/route identifier, never source contents.
 */
export interface UsageAssertionDeclaration {
  id: string;
  path: string;
  marker: string;
  description?: string;
}

export interface CapabilityDeclaration {
  id: string;
  description: string;
  status: "active" | "planned" | "retired";
  /** Files that must exist at the exact verified commit. */
  evidencePaths: string[];
  /** IDs from verification.requiredSignals required to prove this capability. */
  requiredSignals?: string[];
  /** Short marker checks proving the evidence is actually wired into the repo. */
  usageAssertions?: UsageAssertionDeclaration[];
}

export interface RepositoryManifest {
  schemaVersion: "1.0";
  projectId: string;
  repository: {
    provider: string;
    identifier: string;
    defaultBranch: string;
  };
  verification: {
    requiredSignals: RequiredSignalDeclaration[];
  };
  capabilities: CapabilityDeclaration[];
  buildAssist?: {
    enabled: boolean;
    preferredBuilder?: string;
    riskLevel?: "low" | "medium" | "high";
  };
  privacy: {
    /** Operational fields this repo permits in portfolio packets. */
    allowlistedPacketFields: string[];
    /** Human-readable declaration of data that must never leave the repo boundary. */
    forbiddenData: string[];
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest: RepositoryManifest | null;
}

export type CheckObservationStatus = VerificationSignal["status"] | "missing";

export interface CheckObservation {
  id: string;
  name: string;
  required: boolean;
  status: CheckObservationStatus;
  signal: VerificationSignal | null;
}

export interface UsageAssertionObservation {
  id: string;
  path: string;
  passed: boolean;
  reason: "matched" | "file_missing" | "marker_missing";
}

export interface CapabilityObservation {
  id: string;
  claimedStatus: CapabilityDeclaration["status"];
  observedStatus: "verified" | "drifted" | "unverified" | "retired";
  evidencePaths: string[];
  missingEvidencePaths: string[];
  requiredSignalIds: string[];
  failedSignalIds: string[];
  usageAssertionIds: string[];
  failedUsageAssertionIds: string[];
  usageAssertions: UsageAssertionObservation[];
  reason: string | null;
}

export interface RepositoryManifestInspection {
  manifestPath: string;
  manifestHash: string;
  commitSha: string;
  branch: string;
  validation: ManifestValidationResult;
  checks: CheckObservation[];
  capabilities: CapabilityObservation[];
  overallStatus: "passed" | "warning" | "failed";
  scannedAt: string;
}

export interface IngestedCheck {
  id: string;
  name: string;
  required: boolean;
  status: "passed" | "failed" | "skipped" | "pending" | "cancelled";
  detailsUrl?: string;
}

export interface IngestedCapability {
  id: string;
  claimedStatus: "active" | "planned" | "retired";
  observedStatus: "verified" | "drifted" | "unverified" | "retired";
  evidencePaths: string[];
  usageAssertionIds?: string[];
  failedUsageAssertionIds?: string[];
  reason?: string;
}

/**
 * Sanitized packet emitted by a repo-local runner. It deliberately cannot
 * carry source code, user content, transcripts, identities, secrets, or logs.
 */
export interface RepositoryVerificationPacket {
  schemaVersion: "1.0";
  projectId: string;
  repository: {
    provider: string;
    identifier: string;
  };
  commitSha: string;
  branch: string;
  manifestHash: string;
  generatedAt: string;
  runner: {
    provider: string;
    runId?: string;
    detailsUrl?: string;
  };
  checks: IngestedCheck[];
  capabilities: IngestedCapability[];
}
