import { createHash } from "node:crypto";

export const EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT = "juss/external-flaw-finder-observation@v1" as const;
export const SOFA_FLAW_FINDER_PROVIDER = "sofa" as const;
export const SOFA_FLAW_FINDER_REVIEWER_ID = "flaw-finder" as const;

export type FlawFinderTruthState = "VERIFIED" | "INFERRED" | "UNKNOWN" | "BLOCKED";
export type FlawFinderSeverity = "P0" | "P1" | "P2" | "P3";

export const REQUIRED_FLAW_FINDER_ATTACKS = Object.freeze([
  "baseline",
  "assumption",
  "contradiction",
  "inversion",
  "failure_path",
  "authority",
  "evidence",
  "freshness",
  "scope",
  "exploit",
  "outcome",
  "self_attack",
  "counterexample",
  "steelman",
  "second_pass",
] as const);

export type FlawFinderAttack = (typeof REQUIRED_FLAW_FINDER_ATTACKS)[number];

export interface ExternalFlawFinderFinding {
  id: string;
  severity: FlawFinderSeverity;
  truthState: FlawFinderTruthState;
  claim: string;
  trueBaseline: string;
  evidence: string[];
  contradiction: string | null;
  recommendation: string;
  rollback: string;
  nextProofGate: string;
}

export interface ExternalFlawFinderObservation {
  contract: typeof EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT;
  provider: typeof SOFA_FLAW_FINDER_PROVIDER;
  reviewerId: typeof SOFA_FLAW_FINDER_REVIEWER_ID;
  repository: string;
  branch: string;
  headSha: string;
  sourceRef: string | null;
  sourceFingerprint: string;
  observedAt: string;
  expiresAt: string;
  attacksRun: FlawFinderAttack[];
  findings: ExternalFlawFinderFinding[];
  publicationMode: "draft_only";
  proposalOnly: true;
  countsAsIndependentReview: false;
  authority: {
    externalWrite: false;
    merge: false;
    deploy: false;
    publish: false;
    providerMutation: false;
    registryPromotion: false;
  };
  observationHash: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SEVERITIES = new Set<FlawFinderSeverity>(["P0", "P1", "P2", "P3"]);
const TRUTH_STATES = new Set<FlawFinderTruthState>(["VERIFIED", "INFERRED", "UNKNOWN", "BLOCKED"]);
const REQUIRED_ATTACK_SET = new Set<string>(REQUIRED_FLAW_FINDER_ATTACKS);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function externalFlawFinderSourceFingerprint(
  repository: string,
  branch: string,
  headSha: string,
  sourceRef: string | null,
): string {
  return digest([
    EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT,
    text(repository).toLowerCase(),
    text(branch),
    text(headSha).toLowerCase(),
    text(sourceRef) || null,
  ]);
}

function findingIdentity(finding: ExternalFlawFinderFinding): unknown[] {
  return [
    text(finding.id),
    finding.severity,
    finding.truthState,
    text(finding.claim),
    text(finding.trueBaseline),
    normalizedStrings(finding.evidence),
    text(finding.contradiction) || null,
    text(finding.recommendation),
    text(finding.rollback),
    text(finding.nextProofGate),
  ];
}

function observationIdentity(observation: Omit<ExternalFlawFinderObservation, "observationHash">): unknown[] {
  return [
    EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT,
    SOFA_FLAW_FINDER_PROVIDER,
    SOFA_FLAW_FINDER_REVIEWER_ID,
    text(observation.repository).toLowerCase(),
    text(observation.branch),
    text(observation.headSha).toLowerCase(),
    text(observation.sourceRef) || null,
    text(observation.sourceFingerprint).toLowerCase(),
    observation.observedAt,
    observation.expiresAt,
    normalizedStrings(observation.attacksRun),
    observation.findings.map(findingIdentity),
    "draft_only",
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ];
}

export function externalFlawFinderObservationHash(
  observation: Omit<ExternalFlawFinderObservation, "observationHash">,
): string {
  return digest(observationIdentity(observation));
}

export function validateExternalFlawFinderObservation(
  observation: ExternalFlawFinderObservation,
  nowMs = Date.now(),
): string[] {
  const errors: string[] = [];
  if (!observation || typeof observation !== "object") return ["Flaw Finder observation must be an object"];
  if (observation.contract !== EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT) errors.push("Unsupported Flaw Finder observation contract");
  if (observation.provider !== SOFA_FLAW_FINDER_PROVIDER) errors.push("Flaw Finder provider must be sofa");
  if (observation.reviewerId !== SOFA_FLAW_FINDER_REVIEWER_ID) errors.push("Flaw Finder reviewer id must be flaw-finder");
  if (!text(observation.repository)) errors.push("repository is required");
  if (!text(observation.branch)) errors.push("branch is required");
  if (!FULL_SHA.test(text(observation.headSha))) errors.push("headSha must be a full commit SHA");
  if (!SHA256.test(text(observation.sourceFingerprint))) errors.push("sourceFingerprint must be sha256");
  else {
    const expectedSourceFingerprint = externalFlawFinderSourceFingerprint(
      observation.repository,
      observation.branch,
      observation.headSha,
      observation.sourceRef,
    );
    if (observation.sourceFingerprint.toLowerCase() !== expectedSourceFingerprint) {
      errors.push("sourceFingerprint does not match source identity");
    }
  }

  const observedAt = Date.parse(observation.observedAt);
  const expiresAt = Date.parse(observation.expiresAt);
  if (!Number.isFinite(observedAt)) errors.push("observedAt must be RFC3339-compatible");
  if (!Number.isFinite(expiresAt)) errors.push("expiresAt must be RFC3339-compatible");
  if (Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt >= expiresAt) {
    errors.push("expiresAt must be after observedAt");
  }
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) errors.push("Flaw Finder observation is stale");

  const attacks = new Set(Array.isArray(observation.attacksRun) ? observation.attacksRun : []);
  for (const required of REQUIRED_ATTACK_SET) {
    if (!attacks.has(required as FlawFinderAttack)) errors.push(`Required attack was not run: ${required}`);
  }
  if ([...attacks].some((attack) => !REQUIRED_ATTACK_SET.has(attack))) errors.push("Unsupported Flaw Finder attack recorded");

  if (!Array.isArray(observation.findings) || observation.findings.length > 100) {
    errors.push("findings must contain at most 100 items");
  } else {
    const ids = new Set<string>();
    for (const finding of observation.findings) {
      const findingId = text(finding?.id);
      if (!findingId || ids.has(findingId)) errors.push("finding ids must be present and unique");
      if (findingId) ids.add(findingId);
      if (!SEVERITIES.has(finding?.severity)) errors.push(`Unsupported finding severity: ${String(finding?.severity)}`);
      if (!TRUTH_STATES.has(finding?.truthState)) errors.push(`Unsupported truth state: ${String(finding?.truthState)}`);
      if (!text(finding?.claim)) errors.push("finding claim is required");
      if (!text(finding?.trueBaseline)) errors.push("finding trueBaseline is required");
      if (!Array.isArray(finding?.evidence)) errors.push("finding evidence must be an array");
      if (!text(finding?.recommendation)) errors.push("finding recommendation is required");
      if (!text(finding?.rollback)) errors.push("finding rollback is required");
      if (!text(finding?.nextProofGate)) errors.push("finding nextProofGate is required");
    }
  }

  if (observation.publicationMode !== "draft_only") errors.push("Flaw Finder publication mode must remain draft_only");
  if (observation.proposalOnly !== true) errors.push("Flaw Finder observations must remain proposal-only");
  if (observation.countsAsIndependentReview !== false) errors.push("SOFA observation cannot satisfy independent review by itself");
  if (Object.values(observation.authority ?? {}).some(Boolean)) errors.push("Flaw Finder observation cannot carry mutation or promotion authority");
  if (!SHA256.test(text(observation.observationHash))) errors.push("observationHash must be sha256");
  else if (errors.length === 0) {
    const { observationHash: _observationHash, ...identity } = observation;
    if (observation.observationHash.toLowerCase() !== externalFlawFinderObservationHash(identity)) {
      errors.push("observationHash does not match observation content");
    }
  }

  return [...new Set(errors)];
}
