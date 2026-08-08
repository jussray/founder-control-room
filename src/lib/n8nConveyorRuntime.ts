import {
  FOUNDER_CONVEYOR_SKILLS,
  founderConveyorSkillsForStage,
  type FounderConveyorSkillId,
  type FounderConveyorSkillStage,
} from './founderConveyorSkills.js';
import {
  FOUNDER_CONVEYOR_ACCEPTED_EVENT,
  FOUNDER_CONVEYOR_ADVANCE_EVENT,
  FOUNDER_CONVEYOR_CONTRACT,
  founderConveyorReceiptId,
} from './founderConveyorReceipt.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const IDEMPOTENCY_KEY = /^fcr-conveyor-v2:[0-9a-f]{64}$/;

export interface N8nConveyorRuntimeInput {
  contract: string;
  event: string;
  idempotencyKey: string;
  runId: string;
  projectSlug: string;
  goal: string;
  fromStage: FounderConveyorSkillStage;
  toStage: FounderConveyorSkillStage;
  expectedHeadSha: string;
  evidenceUrls: string[];
  authority: {
    advanceStage: boolean;
    merge: boolean;
    deploy: boolean;
    publish: boolean;
    sendExternal: boolean;
  };
}

export interface N8nConveyorReceipt {
  receiptId: string;
  contract: typeof FOUNDER_CONVEYOR_CONTRACT;
  event: typeof FOUNDER_CONVEYOR_ACCEPTED_EVENT;
  idempotencyKey: string;
  runId: string;
  projectSlug: string;
  expectedHeadSha: string;
  fromStage: FounderConveyorSkillStage;
  toStage: FounderConveyorSkillStage;
  skillIds: FounderConveyorSkillId[];
  evidenceUrls: string[];
  authority: {
    advanceStage: true;
    merge: false;
    deploy: false;
    publish: false;
    sendExternal: false;
  };
}

export interface N8nConveyorRuntimeResult {
  ok: boolean;
  status: 200 | 400 | 403;
  errors: string[];
  receipt: N8nConveyorReceipt | null;
}

const NEXT_STAGE: Record<FounderConveyorSkillStage, FounderConveyorSkillStage> = {
  chat: 'workflows',
  workflows: 'code',
  code: 'projects',
  projects: 'skills',
  skills: 'chat',
};

const EVIDENCE_REQUIRED = new Set(['code:projects', 'projects:skills', 'skills:chat']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isStage(value: unknown): value is FounderConveyorSkillStage {
  return typeof value === 'string' && ['chat', 'workflows', 'code', 'projects', 'skills'].includes(value);
}

function validEvidenceUrls(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  return value.every((candidate) => {
    if (typeof candidate !== 'string') return false;
    try {
      const url = new URL(candidate);
      return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch {
      return false;
    }
  });
}

function authorityIsBounded(value: N8nConveyorRuntimeInput['authority']): boolean {
  return value?.advanceStage === true
    && value.merge === false
    && value.deploy === false
    && value.publish === false
    && value.sendExternal === false;
}

export function validateN8nConveyorRuntimeInput(input: N8nConveyorRuntimeInput): string[] {
  const errors: string[] = [];
  if (input.contract !== FOUNDER_CONVEYOR_CONTRACT) errors.push('unsupported contract');
  if (input.event !== FOUNDER_CONVEYOR_ADVANCE_EVENT) errors.push('unsupported event');
  if (!IDEMPOTENCY_KEY.test(text(input.idempotencyKey))) errors.push('invalid idempotency key');
  if (!text(input.runId)) errors.push('runId is required');
  if (!text(input.projectSlug)) errors.push('projectSlug is required');
  if (!text(input.goal)) errors.push('goal is required');
  if (!FULL_SHA.test(text(input.expectedHeadSha))) errors.push('expectedHeadSha must be a full Git SHA');
  if (!isStage(input.fromStage) || !isStage(input.toStage)) errors.push('invalid stage');
  if (isStage(input.fromStage) && isStage(input.toStage) && NEXT_STAGE[input.fromStage] !== input.toStage) {
    errors.push(`transition must advance ${input.fromStage} -> ${NEXT_STAGE[input.fromStage]}`);
  }
  if (!validEvidenceUrls(input.evidenceUrls)) errors.push('invalid evidence URLs');
  if (
    validEvidenceUrls(input.evidenceUrls)
    && isStage(input.fromStage)
    && isStage(input.toStage)
    && EVIDENCE_REQUIRED.has(`${input.fromStage}:${input.toStage}`)
    && input.evidenceUrls.length === 0
  ) {
    errors.push(`evidence is required for ${input.fromStage} -> ${input.toStage}`);
  }
  if (!authorityIsBounded(input.authority)) errors.push('authority envelope is broader than conveyor policy');
  return errors;
}

export function acceptN8nConveyorRuntimeInput(input: N8nConveyorRuntimeInput): N8nConveyorRuntimeResult {
  const errors = validateN8nConveyorRuntimeInput(input);
  if (errors.length > 0) return { ok: false, status: 400, errors, receipt: null };

  const skillIds = [...founderConveyorSkillsForStage(input.toStage)];
  const receiptId = founderConveyorReceiptId({
    idempotencyKey: input.idempotencyKey,
    runId: input.runId,
    projectSlug: input.projectSlug,
    goal: input.goal,
    expectedHeadSha: input.expectedHeadSha,
    fromStage: input.fromStage,
    toStage: input.toStage,
    skillIds,
    evidenceUrls: input.evidenceUrls,
  });

  return {
    ok: true,
    status: 200,
    errors: [],
    receipt: {
      receiptId,
      contract: FOUNDER_CONVEYOR_CONTRACT,
      event: FOUNDER_CONVEYOR_ACCEPTED_EVENT,
      idempotencyKey: input.idempotencyKey,
      runId: input.runId.trim(),
      projectSlug: input.projectSlug.trim(),
      expectedHeadSha: input.expectedHeadSha.toLowerCase(),
      fromStage: input.fromStage,
      toStage: input.toStage,
      skillIds,
      evidenceUrls: [...new Set(input.evidenceUrls.map((url) => url.trim()).filter(Boolean))].sort(),
      authority: {
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      },
    },
  };
}

export function isFounderConveyorSkillId(value: string): value is FounderConveyorSkillId {
  return FOUNDER_CONVEYOR_SKILLS.includes(value as FounderConveyorSkillId);
}
