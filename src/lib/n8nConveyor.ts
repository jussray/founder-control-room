import { createHash } from 'node:crypto';
import type { V10CapabilityPlan } from '../founder-os-lab/capabilityKernel.js';
import {
  founderConveyorSkillsFromPlan,
  validateFounderConveyorCapabilityPlan,
} from './founderConveyorSkills.js';
import {
  FOUNDER_CONVEYOR_CONTRACT,
  FOUNDER_CONVEYOR_IDEMPOTENCY_PREFIX,
  founderConveyorReceiptId,
} from './founderConveyorReceipt.js';
import {
  v10ConveyorEvidenceDigest,
  type V10ConveyorReceiptStore,
} from './v10ConveyorReceiptStore.js';

export const FOUNDER_CONVEYOR_STAGES = [
  'chat',
  'workflows',
  'code',
  'projects',
  'skills',
] as const;

export const FOUNDER_CONVEYOR_ERROR_CONTRACT = 'founder-control-room/n8n-conveyor-error@v1' as const;

export type FounderConveyorStage = (typeof FOUNDER_CONVEYOR_STAGES)[number];
export type FounderConveyorFailureClass =
  | 'AUTH'
  | 'PAYLOAD_CONTRACT'
  | 'SHA_IDENTITY'
  | 'AUTHORITY'
  | 'CAPABILITY_CONTRACT'
  | 'RATE_LIMIT'
  | 'UPSTREAM_FAILURE'
  | 'TIMEOUT'
  | 'NETWORK';

export interface FounderConveyorAdvanceInput {
  runId: string;
  projectSlug: string;
  goal: string;
  fromStage: FounderConveyorStage;
  toStage: FounderConveyorStage;
  expectedHeadSha: string;
  capabilityPlan: V10CapabilityPlan;
  evidenceUrls: string[];
}

export interface FounderConveyorConfig {
  configured: boolean;
  enabled: boolean;
  webhookUrl: string | null;
  bearerToken: string | null;
}

export interface FounderConveyorDispatchResult {
  ok: boolean;
  code:
    | 'DISPATCHED'
    | 'DISPATCH_AUDIT_INCOMPLETE'
    | 'CONVEYOR_DISABLED'
    | 'CONVEYOR_NOT_CONFIGURED'
    | 'INVALID_TRANSITION'
    | 'INVALID_PAYLOAD'
    | 'UPSTREAM_REJECTED'
    | 'UPSTREAM_RECEIPT_MISSING'
    | 'UPSTREAM_RECEIPT_MISMATCH'
    | 'UPSTREAM_UNREACHABLE';
  status: number;
  receiptId: string | null;
  reasons: string[];
  failureClass?: FounderConveyorFailureClass;
  upstreamCode?: string;
  retryable?: boolean;
}

interface DispatchOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  receiptStore?: V10ConveyorReceiptStore;
}

interface SafeN8nFailure {
  failureClass: FounderConveyorFailureClass;
  upstreamCode: string;
  retryable: boolean;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAX_GOAL_LENGTH = 4000;
const MAX_ID_LENGTH = 200;
const MAX_EVIDENCE_URLS = 20;
const SECRETISH_PATTERN = /(github_pat_|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|SERVICE_ROLE|API_KEY|ACCESS_KEY|PASSWORD|SECRET|TOKEN)/i;
const SAFE_N8N_FAILURE_CLASSES = new Set<FounderConveyorFailureClass>([
  'PAYLOAD_CONTRACT',
  'SHA_IDENTITY',
  'AUTHORITY',
  'CAPABILITY_CONTRACT',
]);
const SAFE_N8N_FAILURE_CODES = new Set([
  'PAYLOAD_REJECTED',
  'IDENTITY_REJECTED',
  'AUTHORITY_REJECTED',
  'CAPABILITY_REJECTED',
]);

const NEXT_STAGE: Record<FounderConveyorStage, FounderConveyorStage> = {
  chat: 'workflows',
  workflows: 'code',
  code: 'projects',
  projects: 'skills',
  skills: 'chat',
};

const EVIDENCE_REQUIRED = new Set<string>([
  'code:projects',
  'projects:skills',
  'skills:chat',
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function safeStructuredN8nFailure(value: unknown): SafeN8nFailure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.contract !== FOUNDER_CONVEYOR_ERROR_CONTRACT) return null;

  const failureClass = text(record.failureClass) as FounderConveyorFailureClass;
  const upstreamCode = text(record.errorCode);
  if (!SAFE_N8N_FAILURE_CLASSES.has(failureClass) || !SAFE_N8N_FAILURE_CODES.has(upstreamCode)) return null;

  return {
    failureClass,
    upstreamCode,
    retryable: false,
  };
}

function safeFailureFromHttpStatus(status: number): SafeN8nFailure {
  if (status === 401 || status === 403) {
    return { failureClass: 'AUTH', upstreamCode: 'HTTP_AUTH_REJECTED', retryable: false };
  }
  if (status === 408 || status === 504) {
    return { failureClass: 'TIMEOUT', upstreamCode: 'HTTP_TIMEOUT', retryable: true };
  }
  if (status === 429) {
    return { failureClass: 'RATE_LIMIT', upstreamCode: 'HTTP_RATE_LIMITED', retryable: true };
  }
  if (status === 400 || status === 409 || status === 422) {
    return { failureClass: 'PAYLOAD_CONTRACT', upstreamCode: 'HTTP_CONTRACT_REJECTED', retryable: false };
  }
  return {
    failureClass: 'UPSTREAM_FAILURE',
    upstreamCode: 'HTTP_UPSTREAM_REJECTED',
    retryable: status >= 500,
  };
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function readFounderConveyorConfig(env: NodeJS.ProcessEnv = process.env): FounderConveyorConfig {
  const webhookUrl = text(env.N8N_CONVEYOR_WEBHOOK_URL) || null;
  const bearerToken = text(env.N8N_CONVEYOR_BEARER_TOKEN) || null;
  const enabled = text(env.N8N_CONVEYOR_ENABLED).toLowerCase() === 'true';

  return {
    configured: Boolean(webhookUrl && bearerToken && validHttpUrl(webhookUrl)),
    enabled,
    webhookUrl,
    bearerToken,
  };
}

export function v10ReceiptPersistenceRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return text(env.FCR_V10_RECEIPT_PERSISTENCE_REQUIRED).toLowerCase() === 'true';
}

export function validateFounderConveyorAdvance(input: FounderConveyorAdvanceInput): string[] {
  const reasons: string[] = [];
  const runId = text(input.runId);
  const projectSlug = text(input.projectSlug);
  const goal = text(input.goal);

  if (!runId) reasons.push('runId is required');
  if (runId.length > MAX_ID_LENGTH) reasons.push(`runId must be ${MAX_ID_LENGTH} characters or fewer`);
  if (!projectSlug) reasons.push('projectSlug is required');
  if (projectSlug.length > MAX_ID_LENGTH) reasons.push(`projectSlug must be ${MAX_ID_LENGTH} characters or fewer`);
  if (!goal) reasons.push('goal is required');
  if (goal.length > MAX_GOAL_LENGTH) reasons.push(`goal must be ${MAX_GOAL_LENGTH} characters or fewer`);
  if (SECRETISH_PATTERN.test(goal)) reasons.push('goal must not contain credential-like material');

  if (!FOUNDER_CONVEYOR_STAGES.includes(input.fromStage)) reasons.push('fromStage is invalid');
  if (!FOUNDER_CONVEYOR_STAGES.includes(input.toStage)) reasons.push('toStage is invalid');

  if (
    FOUNDER_CONVEYOR_STAGES.includes(input.fromStage)
    && FOUNDER_CONVEYOR_STAGES.includes(input.toStage)
    && NEXT_STAGE[input.fromStage] !== input.toStage
  ) {
    reasons.push(`transition must advance ${input.fromStage} -> ${NEXT_STAGE[input.fromStage]}`);
  }

  if (!FULL_SHA.test(text(input.expectedHeadSha))) {
    reasons.push('expectedHeadSha must be a full 40-character Git commit SHA');
  }

  if (!Array.isArray(input.evidenceUrls)) {
    reasons.push('evidenceUrls must be an array');
  } else {
    if (input.evidenceUrls.length > MAX_EVIDENCE_URLS) {
      reasons.push(`evidenceUrls must contain ${MAX_EVIDENCE_URLS} entries or fewer`);
    }
    if (input.evidenceUrls.some((url) => !validHttpUrl(text(url)))) {
      reasons.push('every evidence URL must be HTTPS or local HTTP');
    }
    if (EVIDENCE_REQUIRED.has(`${input.fromStage}:${input.toStage}`) && input.evidenceUrls.length === 0) {
      reasons.push(`evidence is required for ${input.fromStage} -> ${input.toStage}`);
    }
  }

  if (!input.capabilityPlan || typeof input.capabilityPlan !== 'object') {
    reasons.push('Chief AI capability plan is required');
  } else {
    reasons.push(...validateFounderConveyorCapabilityPlan(input.capabilityPlan, {
      goal,
      projectSlug,
      expectedHeadSha: input.expectedHeadSha,
    }));
    if (!['reason', 'draft'].includes(input.capabilityPlan.requestedAuthority)) {
      reasons.push('conveyor stage advancement cannot carry reversible or privileged execution authority');
    }
  }

  return [...new Set(reasons)];
}

function receiptIdFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).receiptId;
  return text(candidate) || null;
}

export function founderConveyorIdempotencyKey(input: FounderConveyorAdvanceInput): string {
  const identity = [
    text(input.runId),
    text(input.projectSlug),
    input.fromStage,
    input.toStage,
    text(input.expectedHeadSha).toLowerCase(),
    text(input.capabilityPlan?.planHash).toLowerCase(),
  ].join(':');
  return `${FOUNDER_CONVEYOR_IDEMPOTENCY_PREFIX}${createHash('sha256').update(identity).digest('hex')}`;
}

export function expectedFounderConveyorReceiptId(input: FounderConveyorAdvanceInput): string {
  const idempotencyKey = founderConveyorIdempotencyKey(input);
  return founderConveyorReceiptId({
    idempotencyKey,
    runId: text(input.runId),
    projectSlug: text(input.projectSlug),
    goal: text(input.goal),
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase(),
    fromStage: input.fromStage,
    toStage: input.toStage,
    capabilityPlanHash: input.capabilityPlan.planHash,
    registryHash: input.capabilityPlan.registryHash,
    skillIds: founderConveyorSkillsFromPlan(input.capabilityPlan),
    evidenceUrls: input.evidenceUrls.map((url) => text(url)),
  });
}

async function persistAcceptedReceipt(
  input: FounderConveyorAdvanceInput,
  receiptId: string,
  receiptStore?: V10ConveyorReceiptStore,
) {
  const store = receiptStore ?? (await import('./v10ConveyorReceiptStore.js')).supabaseV10ConveyorReceiptStore;
  return store.store({
    receiptId,
    runId: text(input.runId),
    projectSlug: text(input.projectSlug),
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase(),
    capabilityPlanHash: input.capabilityPlan.planHash.toLowerCase(),
    registryHash: input.capabilityPlan.registryHash.toLowerCase(),
    fromStage: input.fromStage,
    toStage: input.toStage,
    requestedAuthority: input.capabilityPlan.requestedAuthority,
    executionStatus: 'accepted',
    evidenceDigest: v10ConveyorEvidenceDigest(input.evidenceUrls),
  });
}

export async function dispatchFounderConveyorAdvance(
  input: FounderConveyorAdvanceInput,
  options: DispatchOptions = {},
): Promise<FounderConveyorDispatchResult> {
  const env = options.env ?? process.env;
  const config = readFounderConveyorConfig(env);

  if (!config.enabled) {
    return {
      ok: false,
      code: 'CONVEYOR_DISABLED',
      status: 503,
      receiptId: null,
      reasons: ['n8n conveyor execution is disabled'],
    };
  }

  if (!config.configured || !config.webhookUrl || !config.bearerToken) {
    return {
      ok: false,
      code: 'CONVEYOR_NOT_CONFIGURED',
      status: 503,
      receiptId: null,
      reasons: ['n8n conveyor webhook and bearer token must be configured'],
    };
  }

  const reasons = validateFounderConveyorAdvance(input);
  if (reasons.length > 0) {
    return {
      ok: false,
      code: reasons.some((reason) => reason.startsWith('transition must advance'))
        ? 'INVALID_TRANSITION'
        : 'INVALID_PAYLOAD',
      status: 400,
      receiptId: null,
      reasons,
    };
  }

  const idempotencyKey = founderConveyorIdempotencyKey(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.bearerToken}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
    'X-FCR-Conveyor-Contract': 'v3',
  };

  const payload = {
    contract: FOUNDER_CONVEYOR_CONTRACT,
    event: 'conveyor.stage.advance',
    idempotencyKey,
    runId: text(input.runId),
    projectSlug: text(input.projectSlug),
    goal: text(input.goal),
    fromStage: input.fromStage,
    toStage: input.toStage,
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase(),
    capabilityPlan: input.capabilityPlan,
    evidenceUrls: input.evidenceUrls.map((url) => text(url)),
    authority: {
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
  };

  try {
    const response = await fetchImpl(config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    const receiptId = receiptIdFrom(responseBody);

    if (!response.ok) {
      const failure = safeStructuredN8nFailure(responseBody) ?? safeFailureFromHttpStatus(response.status);
      return {
        ok: false,
        code: 'UPSTREAM_REJECTED',
        status: 502,
        receiptId,
        reasons: [`n8n rejected the conveyor transition with HTTP ${response.status}`],
        ...failure,
      };
    }

    if (!receiptId) {
      return {
        ok: false,
        code: 'UPSTREAM_RECEIPT_MISSING',
        status: 502,
        receiptId: null,
        reasons: ['n8n accepted the transition without returning a receiptId'],
      };
    }

    const expectedReceiptId = expectedFounderConveyorReceiptId(input);
    if (receiptId !== expectedReceiptId) {
      return {
        ok: false,
        code: 'UPSTREAM_RECEIPT_MISMATCH',
        status: 502,
        receiptId,
        reasons: ['n8n receipt does not match the canonical v3 capability-plan-bound transition identity'],
      };
    }

    if (v10ReceiptPersistenceRequired(env)) {
      try {
        const disposition = await persistAcceptedReceipt(input, receiptId, options.receiptStore);
        if (disposition === 'conflict') {
          return {
            ok: false,
            code: 'DISPATCH_AUDIT_INCOMPLETE',
            status: 500,
            receiptId,
            reasons: [
              'n8n accepted the transition but the Supabase V10 receipt identity conflicts with an existing audit record; do not retry automatically',
            ],
          };
        }
      } catch {
        return {
          ok: false,
          code: 'DISPATCH_AUDIT_INCOMPLETE',
          status: 500,
          receiptId,
          reasons: [
            'n8n accepted the transition but the Supabase V10 receipt could not be persisted; do not retry automatically',
          ],
        };
      }
    }

    return {
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      receiptId,
      reasons: [],
    };
  } catch (error) {
    const timedOut = isTimeoutError(error);
    return {
      ok: false,
      code: 'UPSTREAM_UNREACHABLE',
      status: 502,
      receiptId: null,
      reasons: [timedOut ? 'n8n conveyor webhook timed out' : 'n8n conveyor webhook was unreachable'],
      failureClass: timedOut ? 'TIMEOUT' : 'NETWORK',
      upstreamCode: timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_UNREACHABLE',
      retryable: true,
    };
  }
}
