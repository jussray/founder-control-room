import { createHash } from 'node:crypto';
import {
  evaluateGeminiMediaProductionCommand,
  type GeminiMediaShotCommand,
  type LeevizeMediaPolicyInput,
  type LeevizeMediaPolicyResult,
  type MediaRendererId,
} from './mediaProductionAuthority.js';

export const MEDIA_PRODUCTION_EXECUTION_CONTRACT = 'founder-control-room/media-production-execution@v1' as const;
export const MEDIA_RENDER_RECEIPT_CONTRACT = 'founder-control-room/media-render-receipt@v1' as const;

export interface MediaRendererRequest {
  commandHash: string;
  projectId: string;
  missionId: string;
  expectedHeadSha: string;
  shotId: string;
  directive: GeminiMediaShotCommand['directive'];
  renderer: MediaRendererId;
  purpose: string;
  maxAttempts: number;
  creditCeiling: number;
  requiredEvidenceRefs: readonly string[];
  strictCanonFingerprints: readonly string[];
  claimIds: readonly string[];
}

export interface MediaRendererResult {
  status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  attempts: number;
  creditsConsumed: number | null;
  outputFingerprint: string | null;
  providerEvidenceRefs: readonly string[];
  failureCode?: string | null;
}

export type MediaRendererAdapter = (request: Readonly<MediaRendererRequest>) => Promise<MediaRendererResult>;
export type MediaRendererAdapters = Partial<Record<MediaRendererId, MediaRendererAdapter>>;

export interface MediaRenderReceipt {
  contract: typeof MEDIA_RENDER_RECEIPT_CONTRACT;
  commandHash: string;
  expectedHeadSha: string;
  shotId: string;
  renderer: MediaRendererId;
  outcome: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'BLOCKED';
  failureCode: string | null;
  attempts: number;
  creditsConsumed: number | null;
  outputFingerprint: string | null;
  providerEvidenceRefs: readonly string[];
  observedAt: string;
  truthAuthority: false;
  publishAuthority: false;
}

export interface MediaProductionExecutionResult {
  contract: typeof MEDIA_PRODUCTION_EXECUTION_CONTRACT;
  status: 'EXECUTED' | 'BLOCKED' | 'PARTIAL' | 'NO_RENDER_ACTION';
  decision: LeevizeMediaPolicyResult['decision'];
  commandHash: string;
  expectedHeadSha: string;
  policy: LeevizeMediaPolicyResult;
  receipts: readonly MediaRenderReceipt[];
  creditsConsumed: number | null;
  executionFingerprint: string;
  truthAuthority: false;
  publishAuthorized: false;
}

export interface MediaProductionExecutionOptions {
  now?: () => Date;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_FAILURE_CODE = /^[a-z0-9._:-]{1,120}$/;
const MAX_EVIDENCE_REF_LENGTH = 512;
const RENDERER_EVIDENCE_PREFIXES: Readonly<Record<MediaRendererId, readonly string[]>> = {
  'gemini-veo': ['provider:gemini-veo:', 'provider:veo:'],
  invideo: ['provider:invideo:'],
  runway: ['provider:runway:'],
  'runtime-capture': ['runtime:', 'browser:'],
  'editor-compositor': ['artifact:', 'editor:'],
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function safeFailureCode(value: unknown, fallback: string): string {
  const normalized = text(value).toLocaleLowerCase('en-US');
  return SAFE_FAILURE_CODE.test(normalized) ? normalized : fallback;
}

function rendererEvidenceRefIsValid(renderer: MediaRendererId, ref: string): boolean {
  if (!ref || ref.length > MAX_EVIDENCE_REF_LENGTH) return false;
  return RENDERER_EVIDENCE_PREFIXES[renderer].some((prefix) => ref.startsWith(prefix));
}

function policyAtExecutionTime(
  input: LeevizeMediaPolicyInput,
  now: Date,
): LeevizeMediaPolicyInput {
  return {
    ...input,
    continuity: {
      ...input.continuity,
      now: now.toISOString(),
    },
  };
}

function baseReceipt(
  input: LeevizeMediaPolicyInput,
  shot: GeminiMediaShotCommand,
  observedAt: string,
): Pick<
  MediaRenderReceipt,
  | 'contract'
  | 'commandHash'
  | 'expectedHeadSha'
  | 'shotId'
  | 'renderer'
  | 'observedAt'
  | 'truthAuthority'
  | 'publishAuthority'
> {
  if (!shot.renderer) throw new Error('media render receipt requires a concrete renderer');
  return {
    contract: MEDIA_RENDER_RECEIPT_CONTRACT,
    commandHash: input.command.commandHash,
    expectedHeadSha: input.continuity.expectedHeadSha.toLowerCase(),
    shotId: shot.shotId,
    renderer: shot.renderer,
    observedAt,
    truthAuthority: false,
    publishAuthority: false,
  };
}

function blockedReceipt(
  input: LeevizeMediaPolicyInput,
  shot: GeminiMediaShotCommand,
  observedAt: string,
  failureCode: string,
): MediaRenderReceipt {
  return {
    ...baseReceipt(input, shot, observedAt),
    outcome: 'BLOCKED',
    failureCode,
    attempts: 0,
    creditsConsumed: 0,
    outputFingerprint: null,
    providerEvidenceRefs: [],
  };
}

function normalizeRendererResult(
  input: LeevizeMediaPolicyInput,
  shot: GeminiMediaShotCommand,
  result: MediaRendererResult,
  observedAt: string,
): MediaRenderReceipt {
  const base = baseReceipt(input, shot, observedAt);
  const attempts = Number.isInteger(result.attempts) && result.attempts >= 0
    ? result.attempts
    : -1;
  const credits = result.creditsConsumed;
  const rawEvidenceRefs = unique(result.providerEvidenceRefs);
  const evidenceRefs = rawEvidenceRefs.filter((ref) => rendererEvidenceRefIsValid(base.renderer, ref));
  const outputFingerprint = text(result.outputFingerprint).toLowerCase() || null;

  if (!['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(result.status)) {
    return {
      ...base,
      outcome: 'UNKNOWN',
      failureCode: 'renderer_status_invalid',
      attempts: Math.max(attempts, 0),
      creditsConsumed: null,
      outputFingerprint: null,
      providerEvidenceRefs: evidenceRefs,
    };
  }

  if (attempts < 0 || attempts > shot.maxAttempts) {
    return {
      ...base,
      outcome: 'FAILED',
      failureCode: 'renderer_attempt_receipt_invalid',
      attempts: Math.max(attempts, 0),
      creditsConsumed: Number.isFinite(credits) && credits !== null ? credits : null,
      outputFingerprint: null,
      providerEvidenceRefs: evidenceRefs,
    };
  }

  if (credits !== null && (!Number.isFinite(credits) || credits < 0)) {
    return {
      ...base,
      outcome: 'FAILED',
      failureCode: 'renderer_credit_receipt_invalid',
      attempts,
      creditsConsumed: null,
      outputFingerprint: null,
      providerEvidenceRefs: evidenceRefs,
    };
  }

  if (credits !== null && credits > shot.creditCeiling) {
    return {
      ...base,
      outcome: 'FAILED',
      failureCode: 'renderer_credit_ceiling_exceeded',
      attempts,
      creditsConsumed: credits,
      outputFingerprint: null,
      providerEvidenceRefs: evidenceRefs,
    };
  }

  if (result.status === 'SUCCEEDED') {
    if (credits === null) {
      return {
        ...base,
        outcome: 'UNKNOWN',
        failureCode: 'renderer_credit_receipt_missing',
        attempts,
        creditsConsumed: null,
        outputFingerprint: SHA256.test(outputFingerprint ?? '') ? outputFingerprint : null,
        providerEvidenceRefs: evidenceRefs,
      };
    }
    if (!SHA256.test(outputFingerprint ?? '')) {
      return {
        ...base,
        outcome: 'UNKNOWN',
        failureCode: 'renderer_output_fingerprint_missing',
        attempts,
        creditsConsumed: credits,
        outputFingerprint: null,
        providerEvidenceRefs: evidenceRefs,
      };
    }
    if (evidenceRefs.length === 0 || evidenceRefs.length !== rawEvidenceRefs.length) {
      return {
        ...base,
        outcome: 'UNKNOWN',
        failureCode: 'renderer_evidence_receipt_invalid',
        attempts,
        creditsConsumed: credits,
        outputFingerprint,
        providerEvidenceRefs: evidenceRefs,
      };
    }
    return {
      ...base,
      outcome: 'SUCCEEDED',
      failureCode: null,
      attempts,
      creditsConsumed: credits,
      outputFingerprint,
      providerEvidenceRefs: evidenceRefs,
    };
  }

  return {
    ...base,
    outcome: result.status,
    failureCode: safeFailureCode(
      result.failureCode,
      result.status === 'FAILED' ? 'renderer_reported_failure' : 'renderer_outcome_unknown',
    ),
    attempts,
    creditsConsumed: credits,
    outputFingerprint: SHA256.test(outputFingerprint ?? '') ? outputFingerprint : null,
    providerEvidenceRefs: evidenceRefs,
  };
}

function finalize(
  input: LeevizeMediaPolicyInput,
  policy: LeevizeMediaPolicyResult,
  status: MediaProductionExecutionResult['status'],
  receipts: readonly MediaRenderReceipt[],
): MediaProductionExecutionResult {
  const knownCredits = receipts.every((receipt) => receipt.creditsConsumed !== null);
  const creditsConsumed = knownCredits
    ? receipts.reduce((total, receipt) => total + (receipt.creditsConsumed ?? 0), 0)
    : null;
  const safeReceiptState = receipts.map((receipt) => ({
    shotId: receipt.shotId,
    renderer: receipt.renderer,
    outcome: receipt.outcome,
    failureCode: receipt.failureCode,
    attempts: receipt.attempts,
    creditsConsumed: receipt.creditsConsumed,
    outputFingerprint: receipt.outputFingerprint,
    providerEvidenceRefs: receipt.providerEvidenceRefs,
    observedAt: receipt.observedAt,
  }));
  const executionFingerprint = fingerprint({
    contract: MEDIA_PRODUCTION_EXECUTION_CONTRACT,
    commandHash: input.command.commandHash,
    expectedHeadSha: input.continuity.expectedHeadSha.toLowerCase(),
    decision: input.command.decision,
    status,
    receipts: safeReceiptState,
  });
  return {
    contract: MEDIA_PRODUCTION_EXECUTION_CONTRACT,
    status,
    decision: input.command.decision,
    commandHash: input.command.commandHash,
    expectedHeadSha: input.continuity.expectedHeadSha.toLowerCase(),
    policy,
    receipts,
    creditsConsumed,
    executionFingerprint,
    truthAuthority: false,
    publishAuthorized: false,
  };
}

/**
 * Executes only renderer work already authorized by a provider-bound Gemini
 * command and accepted by /LEEVIZE. All renderer adapters are injected; this
 * core never reads provider credentials. Missing adapters fail before any
 * external renderer is called, preventing partial side effects. Every shot is
 * revalidated against evidence freshness immediately before dispatch.
 */
export async function executeGeminiMediaProductionPlan(
  input: LeevizeMediaPolicyInput,
  adapters: MediaRendererAdapters,
  options: MediaProductionExecutionOptions = {},
): Promise<MediaProductionExecutionResult> {
  const now = options.now ?? (() => new Date());
  let currentInput = policyAtExecutionTime(input, now());
  let policy = evaluateGeminiMediaProductionCommand(currentInput);
  if (policy.disposition !== 'EXECUTE') {
    return finalize(currentInput, policy, 'BLOCKED', []);
  }

  if (!['AUTHORIZE_PRODUCTION', 'REPAIR'].includes(currentInput.command.decision)) {
    return finalize(currentInput, policy, 'NO_RENDER_ACTION', []);
  }

  const executableShots = currentInput.command.shots.filter((shot) => shot.directive !== 'STOP');
  const unavailable = executableShots.filter((shot) => !shot.renderer || !adapters[shot.renderer]);
  if (unavailable.length > 0) {
    const observedAt = now().toISOString();
    const receipts = unavailable.map((shot) => blockedReceipt(
      currentInput,
      shot,
      observedAt,
      'renderer_unavailable',
    ));
    return finalize(currentInput, policy, 'BLOCKED', receipts);
  }

  const receipts: MediaRenderReceipt[] = [];
  let totalKnownCredits = 0;

  for (const shot of executableShots) {
    currentInput = policyAtExecutionTime(input, now());
    policy = evaluateGeminiMediaProductionCommand(currentInput);
    if (policy.disposition !== 'EXECUTE') {
      receipts.push(blockedReceipt(
        currentInput,
        shot,
        currentInput.continuity.now,
        'policy_invalidated_before_shot',
      ));
      return finalize(currentInput, policy, receipts.some((receipt) => receipt.outcome === 'SUCCEEDED') ? 'PARTIAL' : 'BLOCKED', receipts);
    }

    const renderer = shot.renderer!;
    const adapter = adapters[renderer]!;
    const request: MediaRendererRequest = {
      commandHash: currentInput.command.commandHash,
      projectId: currentInput.command.projectId,
      missionId: currentInput.command.missionId,
      expectedHeadSha: currentInput.continuity.expectedHeadSha.toLowerCase(),
      shotId: shot.shotId,
      directive: shot.directive,
      renderer,
      purpose: shot.purpose,
      maxAttempts: shot.maxAttempts,
      creditCeiling: shot.creditCeiling,
      requiredEvidenceRefs: unique(shot.requiredEvidenceRefs),
      strictCanonFingerprints: unique(shot.strictCanonFingerprints).map((value) => value.toLowerCase()),
      claimIds: unique(shot.claimBindings.map((binding) => binding.claimId)),
    };

    let receipt: MediaRenderReceipt;
    try {
      const result = await adapter(Object.freeze(request));
      receipt = normalizeRendererResult(currentInput, shot, result, now().toISOString());
    } catch {
      receipt = {
        ...baseReceipt(currentInput, shot, now().toISOString()),
        outcome: 'UNKNOWN',
        failureCode: 'renderer_execution_failed',
        attempts: 0,
        creditsConsumed: null,
        outputFingerprint: null,
        providerEvidenceRefs: [],
      };
    }
    receipts.push(receipt);

    if (receipt.creditsConsumed !== null) totalKnownCredits += receipt.creditsConsumed;
    if (receipt.creditsConsumed === null || totalKnownCredits > currentInput.command.maxCredits) {
      if (totalKnownCredits > currentInput.command.maxCredits) {
        receipts[receipts.length - 1] = {
          ...receipt,
          outcome: 'FAILED',
          failureCode: 'command_credit_ceiling_exceeded',
          outputFingerprint: null,
        };
      }
      return finalize(currentInput, policy, 'PARTIAL', receipts);
    }

    if (receipt.outcome !== 'SUCCEEDED') {
      return finalize(currentInput, policy, receipts.length === 1 ? 'BLOCKED' : 'PARTIAL', receipts);
    }
  }

  return finalize(currentInput, policy, 'EXECUTED', receipts);
}
