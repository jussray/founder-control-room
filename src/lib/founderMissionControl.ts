import { createHash } from 'node:crypto';

export const FOUNDER_MISSION_ENVELOPE_CONTRACT = 'juss/founder-mission-envelope@v1' as const;

export const FOUNDER_MISSION_CORE_ARTIFACT_IDS = Object.freeze([
  'mission-brief',
  'system-map',
  'red-team-register',
  'artifact-ledger',
  'bottleneck-map',
  'verification-report',
  'founder-decision-pack',
] as const);

export const FOUNDER_MISSION_PROOF_LEVELS = Object.freeze([
  'plan-only',
  'local-evidence',
  'exact-head',
  'deployed-observation',
  'outcome-verified',
] as const);

export const FOUNDER_MISSION_TASK_STATES = Object.freeze([
  'open',
  'active',
  'blocked',
  'proof_pending',
  'proven',
  'cleared',
] as const);

export type FounderMissionProofLevel = (typeof FOUNDER_MISSION_PROOF_LEVELS)[number];
export type FounderMissionTaskState = (typeof FOUNDER_MISSION_TASK_STATES)[number];
export type FounderMissionProofState = 'unproven' | 'proven';

export interface FounderMissionArtifact {
  artifactId: string;
  ownerLane: string;
  supportLanes: string[];
  status: FounderMissionTaskState;
  requiredProofLevel: FounderMissionProofLevel;
  evidenceRefs: string[];
  approvalGate: 'none' | 'founder';
  rollback?: string;
}

export interface FounderMissionEnvelope {
  contract: typeof FOUNDER_MISSION_ENVELOPE_CONTRACT;
  missionId: string;
  goal: string;
  preservedConstraints: string[];
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
  systemMap: string[];
  redTeamRegister: string[];
  bottleneckMap: string[];
  artifacts: FounderMissionArtifact[];
  requiredProofLevel: FounderMissionProofLevel;
  currentProofLevel: FounderMissionProofLevel;
  proofState: FounderMissionProofState;
  taskState: FounderMissionTaskState;
  proofRefs: string[];
  rollback: string;
  version: number;
  predecessorFingerprint?: string;
  createdAt: string;
}

export interface FounderMissionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FounderMissionClearance {
  proofSatisfied: boolean;
  clearanceAllowed: boolean;
  requiredProofLevel: FounderMissionProofLevel;
  currentProofLevel: FounderMissionProofLevel;
  nextGate: string | null;
}

const PROOF_RANK: Record<FounderMissionProofLevel, number> = {
  'plan-only': 0,
  'local-evidence': 1,
  'exact-head': 2,
  'deployed-observation': 3,
  'outcome-verified': 4,
};

const PROOF_LEVEL_SET = new Set<string>(FOUNDER_MISSION_PROOF_LEVELS);
const TASK_STATE_SET = new Set<string>(FOUNDER_MISSION_TASK_STATES);
const PROOF_STATE_SET = new Set<string>(['unproven', 'proven']);
const APPROVAL_GATE_SET = new Set<string>(['none', 'founder']);
const SHA256 = /^[0-9a-f]{64}$/i;
const ACTION_ID_SYNTAX = /^[a-z0-9][a-z0-9:_-]{0,127}$/;

function canonicalize(value: unknown, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non_finite_number:${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => {
          if (record[key] === undefined) throw new Error(`undefined_value:${path}.${key}`);
          return [key, canonicalize(record[key], `${path}.${key}`)];
        }),
    );
  }
  throw new Error(`unsupported_value:${path}`);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function canonicalMissionJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function founderMissionFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalMissionJson(value)).digest('hex');
}

export function proofLevelSatisfies(
  current: FounderMissionProofLevel,
  required: FounderMissionProofLevel,
): boolean {
  return PROOF_LEVEL_SET.has(current)
    && PROOF_LEVEL_SET.has(required)
    && PROOF_RANK[current] >= PROOF_RANK[required];
}

// Syntax validation is not registry authority. FCR execution must separately
// resolve the current action/workflow registry and authority policy before use.
export function isActionIdSyntaxValid(value: string): boolean {
  return typeof value === 'string' && ACTION_ID_SYNTAX.test(value);
}

function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function evaluateFounderMissionClearance(
  envelope: FounderMissionEnvelope,
): FounderMissionClearance {
  const levelSatisfied = proofLevelSatisfies(envelope.currentProofLevel, envelope.requiredProofLevel);
  const hasEvidence = Array.isArray(envelope.proofRefs) && envelope.proofRefs.length > 0;
  const proofSatisfied = envelope.proofState === 'proven' && levelSatisfied && hasEvidence;

  let nextGate: string | null = null;
  if (!levelSatisfied) {
    nextGate = `obtain ${envelope.requiredProofLevel} proof`;
  } else if (!hasEvidence) {
    nextGate = 'attach evidence references';
  } else if (envelope.proofState !== 'proven') {
    nextGate = 'validate evidence and mark proof proven';
  }

  return {
    proofSatisfied,
    clearanceAllowed: proofSatisfied,
    requiredProofLevel: envelope.requiredProofLevel,
    currentProofLevel: envelope.currentProofLevel,
    nextGate,
  };
}

export function validateFounderMissionEnvelope(
  envelope: FounderMissionEnvelope,
): FounderMissionValidationResult {
  const errors: string[] = [];

  if (envelope.contract !== FOUNDER_MISSION_ENVELOPE_CONTRACT) errors.push('mission contract drifted');
  if (!nonEmptyString(envelope.missionId)) errors.push('missionId is required');
  if (!nonEmptyString(envelope.goal)) errors.push('goal is required');
  if (!nonEmptyString(envelope.rollback)) errors.push('rollback is required');

  for (const [field, value] of Object.entries({
    who: envelope.who,
    what: envelope.what,
    where: envelope.where,
    when: envelope.when,
    why: envelope.why,
    how: envelope.how,
  })) {
    if (!nonEmptyString(value)) errors.push(`${field} is required`);
  }

  if (!PROOF_LEVEL_SET.has(envelope.requiredProofLevel)) errors.push('requiredProofLevel is invalid');
  if (!PROOF_LEVEL_SET.has(envelope.currentProofLevel)) errors.push('currentProofLevel is invalid');
  if (!PROOF_STATE_SET.has(envelope.proofState)) errors.push('proofState is invalid');
  if (!TASK_STATE_SET.has(envelope.taskState)) errors.push('taskState is invalid');

  if (!Number.isInteger(envelope.version) || envelope.version < 1) errors.push('version must be a positive integer');
  if (envelope.version > 1 && !SHA256.test(envelope.predecessorFingerprint ?? '')) {
    errors.push('successor versions require a predecessor fingerprint');
  }
  if (envelope.version === 1 && envelope.predecessorFingerprint) {
    errors.push('version 1 must not claim a predecessor fingerprint');
  }
  if (!isIsoTimestamp(envelope.createdAt)) errors.push('createdAt must be a canonical ISO timestamp');

  const artifacts = Array.isArray(envelope.artifacts) ? envelope.artifacts : [];
  if (!Array.isArray(envelope.artifacts)) errors.push('artifacts must be an array');
  const artifactIds = artifacts.map((artifact) => artifact?.artifactId);
  const uniqueArtifactIds = new Set(artifactIds);
  if (uniqueArtifactIds.size !== artifactIds.length) errors.push('artifact IDs must be unique');

  for (const requiredId of FOUNDER_MISSION_CORE_ARTIFACT_IDS) {
    if (!uniqueArtifactIds.has(requiredId)) errors.push(`missing core artifact ${requiredId}`);
  }

  for (const artifact of artifacts) {
    const artifactId = nonEmptyString(artifact?.artifactId) ? artifact.artifactId : '<unknown>';
    if (!nonEmptyString(artifact?.artifactId)) errors.push('artifactId is required');
    if (!nonEmptyString(artifact?.ownerLane)) errors.push(`artifact ${artifactId} requires exactly one owner lane`);
    if (!TASK_STATE_SET.has(artifact?.status)) errors.push(`artifact ${artifactId} status is invalid`);
    if (!PROOF_LEVEL_SET.has(artifact?.requiredProofLevel)) {
      errors.push(`artifact ${artifactId} requiredProofLevel is invalid`);
    }
    if (!APPROVAL_GATE_SET.has(artifact?.approvalGate)) errors.push(`artifact ${artifactId} approvalGate is invalid`);

    const supportLanes = Array.isArray(artifact?.supportLanes) ? artifact.supportLanes : [];
    if (!Array.isArray(artifact?.supportLanes)) errors.push(`artifact ${artifactId} support lanes must be an array`);
    if (new Set(supportLanes).size !== supportLanes.length) {
      errors.push(`artifact ${artifactId} support lanes must be unique`);
    }
    if (supportLanes.includes(artifact?.ownerLane)) {
      errors.push(`artifact ${artifactId} owner lane cannot also be a support lane`);
    }

    const evidenceRefs = Array.isArray(artifact?.evidenceRefs) ? artifact.evidenceRefs : [];
    if (!Array.isArray(artifact?.evidenceRefs)) errors.push(`artifact ${artifactId} evidenceRefs must be an array`);
    if (artifact?.status === 'cleared') {
      const artifactProofSatisfied = PROOF_LEVEL_SET.has(artifact.requiredProofLevel)
        && proofLevelSatisfies(envelope.currentProofLevel, artifact.requiredProofLevel)
        && evidenceRefs.length > 0;
      if (!artifactProofSatisfied) {
        errors.push(`artifact ${artifactId} cannot clear before its required proof is satisfied`);
      }
    }
  }

  const clearance = evaluateFounderMissionClearance(envelope);
  if (envelope.proofState === 'proven' && !clearance.proofSatisfied) {
    errors.push('proofState cannot be proven before required proof and evidence are satisfied');
  }
  if (envelope.taskState === 'proven' && !clearance.proofSatisfied) {
    errors.push('task cannot be proven before required proof is satisfied');
  }
  if (envelope.taskState === 'cleared' && !clearance.proofSatisfied) {
    errors.push('task cannot clear before proof is proven at the required level');
  }

  return { valid: errors.length === 0, errors };
}

export function createFounderMissionSuccessor(
  prior: FounderMissionEnvelope,
  next: Omit<FounderMissionEnvelope, 'version' | 'predecessorFingerprint'>,
): FounderMissionEnvelope {
  const priorValidation = validateFounderMissionEnvelope(prior);
  if (!priorValidation.valid) throw new Error(`prior mission invalid: ${priorValidation.errors.join('; ')}`);
  if (next.missionId !== prior.missionId) {
    throw new Error('mission identity cannot change across append-only successors');
  }
  const successor: FounderMissionEnvelope = {
    ...next,
    version: prior.version + 1,
    predecessorFingerprint: founderMissionFingerprint(prior),
  };
  const successorValidation = validateFounderMissionEnvelope(successor);
  if (!successorValidation.valid) throw new Error(`successor mission invalid: ${successorValidation.errors.join('; ')}`);
  return successor;
}
