import { createHash } from 'node:crypto';

export const PROJECT_STATE_PACKET_CONTRACT = 'juss/ai-interop/project-state@v1' as const;
export const INSTRUCTION_PACKET_CONTRACT = 'juss/ai-interop/instruction@v1' as const;
export const DEEPSEEK_INSTRUCTOR_AGENT_ID = 'deepseek-instructor' as const;

export type DeepSeekInstructorSkill =
  | 'ultrathink'
  | 'attack'
  | 'solutions'
  | 'lindymode'
  | 'l99'
  | 'ooda'
  | 'redteam'
  | 'truthmode'
  | 'confess';

export type InteropPurpose = 'review' | 'challenge' | 'instruction' | 'cross_project_hypothesis';
export type InteropAuthority = 'read_only' | 'proposal_only';
export type InteropSensitivity = 'public' | 'internal' | 'restricted';
export type InteropFederationMode = 'shadow_only' | 'proposal_only';
export type UsefulnessReceiptState = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN' | 'BLOCKED';

export interface ProjectStatePacketV1 {
  contract: typeof PROJECT_STATE_PACKET_CONTRACT;
  packetId: string;
  fromProject: string;
  toAgent: typeof DEEPSEEK_INSTRUCTOR_AGENT_ID;
  purpose: InteropPurpose;
  authority: InteropAuthority;
  goal: string;
  source: {
    repository: string;
    branch: string;
    headSha: string;
    observedAt: string;
  };
  truth: {
    verified: string[];
    inferred: string[];
    unknown: string[];
    blocked: string[];
  };
  requestedSkills: DeepSeekInstructorSkill[];
  sensitivity: InteropSensitivity;
  expiresAt: string;
  stateFingerprint: string;
}

export interface InstructionPacketV1 {
  contract: typeof INSTRUCTION_PACKET_CONTRACT;
  instructionId: string;
  sourcePacketId: string;
  sourceStateFingerprint: string;
  fromAgent: typeof DEEPSEEK_INSTRUCTOR_AGENT_ID;
  toProject: string;
  disposition: 'TEACH' | 'CHALLENGE' | 'HOLD' | 'STOP';
  reality: string[];
  suspectedRootCause: string | null;
  smallestSafeFix: string | null;
  proofRequired: string[];
  crossProjectLesson: {
    pattern: string;
    portable: boolean;
  } | null;
  authorityRequested: 'none';
  projectMutationAuthorized: false;
  mergeAuthorized: false;
  deployAuthorized: false;
  providerMutationAuthorized: false;
  instructionHash: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VALID_SKILLS = new Set<DeepSeekInstructorSkill>([
  'ultrathink',
  'attack',
  'solutions',
  'lindymode',
  'l99',
  'ooda',
  'redteam',
  'truthmode',
  'confess',
]);
const VALID_PURPOSES = new Set<InteropPurpose>(['review', 'challenge', 'instruction', 'cross_project_hypothesis']);
const VALID_AUTHORITIES = new Set<InteropAuthority>(['read_only', 'proposal_only']);
const VALID_SENSITIVITY = new Set<InteropSensitivity>(['public', 'internal', 'restricted']);
const VALID_DISPOSITIONS = new Set<InstructionPacketV1['disposition']>(['TEACH', 'CHALLENGE', 'HOLD', 'STOP']);

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort()
    : [];
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function packetIdentity(input: Omit<ProjectStatePacketV1, 'stateFingerprint'>): unknown[] {
  return [
    PROJECT_STATE_PACKET_CONTRACT,
    input.packetId.trim(),
    input.fromProject.trim(),
    DEEPSEEK_INSTRUCTOR_AGENT_ID,
    input.purpose,
    input.authority,
    input.goal.trim(),
    input.source.repository.trim(),
    input.source.branch.trim(),
    input.source.headSha.toLowerCase(),
    input.source.observedAt,
    normalizedList(input.truth.verified),
    normalizedList(input.truth.inferred),
    normalizedList(input.truth.unknown),
    normalizedList(input.truth.blocked),
    [...new Set(input.requestedSkills)].sort(),
    input.sensitivity,
    input.expiresAt,
  ];
}

export function projectStateFingerprint(input: Omit<ProjectStatePacketV1, 'stateFingerprint'>): string {
  return digest(packetIdentity(input));
}

function instructionIdentity(input: Omit<InstructionPacketV1, 'instructionHash'>): unknown[] {
  return [
    INSTRUCTION_PACKET_CONTRACT,
    input.instructionId.trim(),
    input.sourcePacketId.trim(),
    input.sourceStateFingerprint.toLowerCase(),
    DEEPSEEK_INSTRUCTOR_AGENT_ID,
    input.toProject.trim(),
    input.disposition,
    normalizedList(input.reality),
    input.suspectedRootCause?.trim() ?? null,
    input.smallestSafeFix?.trim() ?? null,
    normalizedList(input.proofRequired),
    input.crossProjectLesson
      ? [input.crossProjectLesson.pattern.trim(), input.crossProjectLesson.portable]
      : null,
    'none',
    false,
    false,
    false,
    false,
  ];
}

export function instructionPacketHash(input: Omit<InstructionPacketV1, 'instructionHash'>): string {
  return digest(instructionIdentity(input));
}

function boundedTextErrors(value: string, label: string, max: number): string[] {
  if (!value) return [`${label} is required`];
  if (value.length > max) return [`${label} exceeds ${max} characters`];
  return [];
}

function boundedListErrors(value: string[], label: string, maxItems = 50, maxChars = 2_000): string[] {
  const errors: string[] = [];
  if (value.length > maxItems) errors.push(`${label} exceeds ${maxItems} items`);
  if (value.some((item) => item.length > maxChars)) errors.push(`${label} contains an item over ${maxChars} characters`);
  return errors;
}

export function validateProjectStatePacket(value: unknown, nowMs = Date.now()): string[] {
  const candidate = record(value);
  if (!candidate) return ['project state packet shape is invalid'];

  const errors: string[] = [];
  const packetId = text(candidate.packetId);
  const fromProject = text(candidate.fromProject);
  const goal = text(candidate.goal);
  const source = record(candidate.source);
  const truth = record(candidate.truth);
  const repository = text(source?.repository);
  const branch = text(source?.branch);
  const headSha = text(source?.headSha).toLowerCase();
  const observedAt = text(source?.observedAt);
  const expiresAt = text(candidate.expiresAt);
  const verified = normalizedList(truth?.verified);
  const inferred = normalizedList(truth?.inferred);
  const unknown = normalizedList(truth?.unknown);
  const blocked = normalizedList(truth?.blocked);
  const requestedSkills = Array.isArray(candidate.requestedSkills)
    ? candidate.requestedSkills.filter((item): item is DeepSeekInstructorSkill => typeof item === 'string' && VALID_SKILLS.has(item as DeepSeekInstructorSkill))
    : [];
  const stateFingerprint = text(candidate.stateFingerprint).toLowerCase();

  if (candidate.contract !== PROJECT_STATE_PACKET_CONTRACT) errors.push('project state packet contract is unsupported');
  errors.push(...boundedTextErrors(packetId, 'project state packetId', 128));
  errors.push(...boundedTextErrors(fromProject, 'project state fromProject', 128));
  if (candidate.toAgent !== DEEPSEEK_INSTRUCTOR_AGENT_ID) errors.push('project state packet must target deepseek-instructor');
  if (!VALID_PURPOSES.has(candidate.purpose as InteropPurpose)) errors.push('project state purpose is unsupported');
  if (!VALID_AUTHORITIES.has(candidate.authority as InteropAuthority)) errors.push('project state authority is unsupported');
  errors.push(...boundedTextErrors(goal, 'project state goal', 4_000));
  if (!REPOSITORY.test(repository)) errors.push('project state repository must be owner/name');
  errors.push(...boundedTextErrors(branch, 'project state branch', 200));
  if (!FULL_SHA.test(headSha)) errors.push('project state headSha must be a full Git SHA');
  const observedAtMs = Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs)) errors.push('project state observedAt must be RFC3339-compatible');
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    errors.push('project state expiresAt must be RFC3339-compatible');
  } else if (expiresAtMs <= nowMs) {
    errors.push('project state packet is expired');
  }
  if (Number.isFinite(observedAtMs) && Number.isFinite(expiresAtMs) && observedAtMs > expiresAtMs) {
    errors.push('project state observedAt cannot be after expiresAt');
  }
  errors.push(...boundedListErrors(verified, 'project state verified'));
  errors.push(...boundedListErrors(inferred, 'project state inferred'));
  errors.push(...boundedListErrors(unknown, 'project state unknown'));
  errors.push(...boundedListErrors(blocked, 'project state blocked'));
  if (!Array.isArray(candidate.requestedSkills) || requestedSkills.length !== candidate.requestedSkills.length || requestedSkills.length === 0) {
    errors.push('project state requestedSkills must contain only recognized instructor skills');
  }
  if (!VALID_SENSITIVITY.has(candidate.sensitivity as InteropSensitivity)) errors.push('project state sensitivity is unsupported');
  if (!SHA256.test(stateFingerprint)) errors.push('project state fingerprint must be sha256');

  if (errors.length === 0 && source && truth) {
    const expected = projectStateFingerprint({
      contract: PROJECT_STATE_PACKET_CONTRACT,
      packetId,
      fromProject,
      toAgent: DEEPSEEK_INSTRUCTOR_AGENT_ID,
      purpose: candidate.purpose as InteropPurpose,
      authority: candidate.authority as InteropAuthority,
      goal,
      source: { repository, branch, headSha, observedAt },
      truth: { verified, inferred, unknown, blocked },
      requestedSkills,
      sensitivity: candidate.sensitivity as InteropSensitivity,
      expiresAt,
    });
    if (stateFingerprint !== expected) errors.push('project state fingerprint does not match canonical packet identity');
  }

  return [...new Set(errors)];
}

export function validateInstructionPacket(
  value: unknown,
  sourcePacket?: ProjectStatePacketV1,
  nowMs = Date.now(),
): string[] {
  const candidate = record(value);
  if (!candidate) return ['instruction packet shape is invalid'];

  const errors: string[] = [];
  const instructionId = text(candidate.instructionId);
  const sourcePacketId = text(candidate.sourcePacketId);
  const sourceStateFingerprint = text(candidate.sourceStateFingerprint).toLowerCase();
  const toProject = text(candidate.toProject);
  const reality = normalizedList(candidate.reality);
  const suspectedRootCause = candidate.suspectedRootCause === null ? null : text(candidate.suspectedRootCause);
  const smallestSafeFix = candidate.smallestSafeFix === null ? null : text(candidate.smallestSafeFix);
  const proofRequired = normalizedList(candidate.proofRequired);
  const crossProjectLessonRecord = candidate.crossProjectLesson === null ? null : record(candidate.crossProjectLesson);
  const lessonPattern = crossProjectLessonRecord ? text(crossProjectLessonRecord.pattern) : '';
  const lessonPortable = crossProjectLessonRecord?.portable;
  const instructionHash = text(candidate.instructionHash).toLowerCase();

  if (candidate.contract !== INSTRUCTION_PACKET_CONTRACT) errors.push('instruction packet contract is unsupported');
  errors.push(...boundedTextErrors(instructionId, 'instruction instructionId', 128));
  errors.push(...boundedTextErrors(sourcePacketId, 'instruction sourcePacketId', 128));
  if (!SHA256.test(sourceStateFingerprint)) errors.push('instruction sourceStateFingerprint must be sha256');
  if (candidate.fromAgent !== DEEPSEEK_INSTRUCTOR_AGENT_ID) errors.push('instruction must come from deepseek-instructor');
  errors.push(...boundedTextErrors(toProject, 'instruction toProject', 128));
  if (!VALID_DISPOSITIONS.has(candidate.disposition as InstructionPacketV1['disposition'])) errors.push('instruction disposition is unsupported');
  errors.push(...boundedListErrors(reality, 'instruction reality'));
  if (suspectedRootCause !== null) errors.push(...boundedTextErrors(suspectedRootCause, 'instruction suspectedRootCause', 4_000));
  if (smallestSafeFix !== null) errors.push(...boundedTextErrors(smallestSafeFix, 'instruction smallestSafeFix', 4_000));
  errors.push(...boundedListErrors(proofRequired, 'instruction proofRequired', 50, 500));
  if (candidate.crossProjectLesson !== null) {
    if (!crossProjectLessonRecord || !lessonPattern || typeof lessonPortable !== 'boolean') {
      errors.push('instruction crossProjectLesson is invalid');
    }
  }
  if (candidate.authorityRequested !== 'none') errors.push('DeepSeek instructor cannot request authority');
  if (candidate.projectMutationAuthorized !== false) errors.push('DeepSeek instructor cannot authorize project mutation');
  if (candidate.mergeAuthorized !== false) errors.push('DeepSeek instructor cannot authorize merge');
  if (candidate.deployAuthorized !== false) errors.push('DeepSeek instructor cannot authorize deploy');
  if (candidate.providerMutationAuthorized !== false) errors.push('DeepSeek instructor cannot authorize provider mutation');
  if (!SHA256.test(instructionHash)) errors.push('instruction instructionHash must be sha256');

  if (sourcePacket) {
    const sourcePacketErrors = validateProjectStatePacket(sourcePacket, nowMs);
    errors.push(...sourcePacketErrors.map((error) => `instruction source packet invalid: ${error}`));
    if (sourcePacketId !== sourcePacket.packetId) errors.push('instruction is not bound to the source packetId');
    if (sourceStateFingerprint !== sourcePacket.stateFingerprint) errors.push('instruction is not bound to the source state fingerprint');
    if (toProject !== sourcePacket.fromProject) errors.push('instruction must return to the source project');
  }

  if (errors.length === 0) {
    const expected = instructionPacketHash({
      contract: INSTRUCTION_PACKET_CONTRACT,
      instructionId,
      sourcePacketId,
      sourceStateFingerprint,
      fromAgent: DEEPSEEK_INSTRUCTOR_AGENT_ID,
      toProject,
      disposition: candidate.disposition as InstructionPacketV1['disposition'],
      reality,
      suspectedRootCause,
      smallestSafeFix,
      proofRequired,
      crossProjectLesson: candidate.crossProjectLesson === null
        ? null
        : { pattern: lessonPattern, portable: lessonPortable as boolean },
      authorityRequested: 'none',
      projectMutationAuthorized: false,
      mergeAuthorized: false,
      deployAuthorized: false,
      providerMutationAuthorized: false,
    });
    if (instructionHash !== expected) errors.push('instruction hash does not match canonical packet identity');
  }

  return [...new Set(errors)];
}

export function resolveDeepSeekFederationMode(usefulnessReceiptState: UsefulnessReceiptState): InteropFederationMode {
  return usefulnessReceiptState === 'VERIFIED' ? 'proposal_only' : 'shadow_only';
}
