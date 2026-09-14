import { createHash } from 'node:crypto';
import { parseFounderConveyorCommands } from '../lib/founderConveyorCommands.js';
import {
  prepareSharedReadOnlyCapabilityRun,
  SharedCapabilityRuntimeError,
  type InteractionSurface,
  type SharedRuntimeFounderIdentity,
} from './sharedCapabilityRuntime.js';
import type { Capability } from './workbenchRegistry.js';

export const ULTRATHINK_SHARED_REASONING_CAPABILITY_ID = 'ultrathink-shared-reasoning-v1';
export const ULTRATHINK_REASONING_RESOLUTION_CONTRACT = 'fcr/ultrathink-reasoning-resolution@v1' as const;

export type UltrathinkContinuityTransition = 'initial' | 'confirmed' | 'changed';

export interface UltrathinkSharedReasoningInput {
  executionId: string;
  surface?: unknown;
  intent: string;
  founder?: SharedRuntimeFounderIdentity;
  priorEvidenceFingerprint?: string | null;
  priorProofCookie?: string | null;
}

export interface UltrathinkReasoningResolutionReceipt {
  contract: typeof ULTRATHINK_REASONING_RESOLUTION_CONTRACT;
  executionId: string;
  capabilityId: typeof ULTRATHINK_SHARED_REASONING_CAPABILITY_ID;
  command: '/ultrathink';
  surface: InteractionSurface;
  state: 'RESOLVED';
  intentFingerprint: string;
  requestFingerprint: string;
  runtimeAuthority: {
    mode: 'read_only';
    consequence: 'READ';
    mutationAllowed: false;
    approvalRequired: false;
    checkedAt: string;
    founderSubjectFingerprint: string;
    authorityRevision: string;
  };
  reasoning: {
    mode: 'reason_only';
    providerExecution: false;
    mutationAllowed: false;
    approvalRequired: false;
  };
  continuity: {
    predecessorFingerprint: string | null;
    predecessorProofCookie: string | null;
    evidenceFingerprint: string;
    proofCookie: string;
    transition: UltrathinkContinuityTransition;
    authorityEffect: 'none';
  };
  completionClaim: {
    allowed: false;
    reason: 'reasoning_mode_resolved_not_executed';
  };
}

export interface UltrathinkReasoningPresentation {
  contract: 'fcr/ultrathink-reasoning-presentation@v1';
  surface: InteractionSurface;
  channel: 'speech_and_text' | 'text';
  summary: string;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function continuityValue(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 256) : null;
}

function proofCookieFor(evidenceFingerprint: string): string {
  return `ultrathink-reasoning:v1:${evidenceFingerprint.replace(/^sha256:/, '').slice(0, 32)}`;
}

export function resolveUltrathinkSharedReasoning(
  input: UltrathinkSharedReasoningInput,
): { receipt: UltrathinkReasoningResolutionReceipt; presentation: UltrathinkReasoningPresentation } {
  const intent = typeof input.intent === 'string' ? input.intent.trim() : '';
  if (!intent || intent.length > 4_096 || !parseFounderConveyorCommands(intent).includes('/ultrathink')) {
    throw new SharedCapabilityRuntimeError(
      'shared_runtime_invalid_request',
      'ULTRATHINK shared-runtime resolution requires a bounded intent containing the /ultrathink command.',
    );
  }

  const prepared = prepareSharedReadOnlyCapabilityRun({
    executionId: input.executionId,
    capabilityId: ULTRATHINK_SHARED_REASONING_CAPABILITY_ID,
    surface: input.surface,
    intent,
    founder: input.founder,
  });

  const requestFingerprint = sha256({
    capabilityId: ULTRATHINK_SHARED_REASONING_CAPABILITY_ID,
    command: '/ultrathink',
    surface: prepared.surface,
    intentFingerprint: prepared.intentFingerprint,
    authorityRevision: prepared.authority.authorityRevision,
  });
  const evidenceFingerprint = sha256({
    capabilityId: ULTRATHINK_SHARED_REASONING_CAPABILITY_ID,
    command: '/ultrathink',
    intentFingerprint: prepared.intentFingerprint,
    authorityRevision: prepared.authority.authorityRevision,
    consequence: 'READ',
    mutationAllowed: false,
    providerExecution: false,
  });
  const proofCookie = proofCookieFor(evidenceFingerprint);
  const predecessorFingerprint = continuityValue(input.priorEvidenceFingerprint);
  const predecessorProofCookie = continuityValue(input.priorProofCookie);
  const transition: UltrathinkContinuityTransition = predecessorFingerprint === null
    ? 'initial'
    : predecessorFingerprint === evidenceFingerprint
      && (predecessorProofCookie === null || predecessorProofCookie === proofCookie)
      ? 'confirmed'
      : 'changed';

  const receipt: UltrathinkReasoningResolutionReceipt = {
    contract: ULTRATHINK_REASONING_RESOLUTION_CONTRACT,
    executionId: prepared.executionId,
    capabilityId: ULTRATHINK_SHARED_REASONING_CAPABILITY_ID,
    command: '/ultrathink',
    surface: prepared.surface,
    state: 'RESOLVED',
    intentFingerprint: prepared.intentFingerprint,
    requestFingerprint,
    runtimeAuthority: prepared.authority,
    reasoning: {
      mode: 'reason_only',
      providerExecution: false,
      mutationAllowed: false,
      approvalRequired: false,
    },
    continuity: {
      predecessorFingerprint,
      predecessorProofCookie,
      evidenceFingerprint,
      proofCookie,
      transition,
      authorityEffect: 'none',
    },
    completionClaim: {
      allowed: false,
      reason: 'reasoning_mode_resolved_not_executed',
    },
  };

  return {
    receipt,
    presentation: {
      contract: 'fcr/ultrathink-reasoning-presentation@v1',
      surface: prepared.surface,
      channel: prepared.surface === 'voice' ? 'speech_and_text' : 'text',
      summary: 'ULTRATHINK reasoning mode is resolved for this founder intent. No provider execution or mutation has occurred.',
    },
  };
}

export const ULTRATHINK_SHARED_REASONING_CAPABILITY: Capability = {
  id: ULTRATHINK_SHARED_REASONING_CAPABILITY_ID,
  kind: 'Prompt',
  category: 'prompts',
  score: 98,
  runtime: 'dynamic',
  summary: 'Resolve /ultrathink through the same founder-authenticated capability runtime used by voice, text, mobile, desktop, and automation.',
  purpose: 'Give every interaction surface one non-authorizing ULTRATHINK reasoning identity, continuity fingerprint, proof cookie, and authority receipt before any later provider or action capability is considered.',
  inputs: [
    ['surface', 'enum', 'voice | text | mobile | desktop | automation | future'],
    ['intent', 'text', 'Bounded founder intent containing /ultrathink'],
    ['priorEvidenceFingerprint', 'fingerprint', 'Optional predecessor reasoning fingerprint'],
    ['priorProofCookie', 'non-secret marker', 'Optional predecessor proof cookie; never authority'],
  ],
  environment: ['FCR shared capability runtime', 'Current server-authenticated founder identity', 'No provider credentials required'],
  proof: [
    'Voice and text preserve the same semantic evidence fingerprint for the same founder intent',
    'Surface-specific request fingerprints do not mint new authority',
    'Continuity fingerprints and proof cookies classify initial, confirmed, or changed state without granting authority',
    'Resolution emits reason_only with providerExecution=false and mutationAllowed=false',
    'Completion remains blocked because resolving a reasoning mode is not executing or verifying an outcome',
  ],
  risk: 'Reasoning resolution only. It does not invoke a model provider, execute a tool, merge, deploy, publish, change credentials, or grant mutation authority. Any later action must enter its own existing authority and verification path.',
  implementation: 'Runtime-backed: POST /capabilities/ultrathink-shared-reasoning-v1/runs with { surface, intent, priorEvidenceFingerprint?, priorProofCookie? }. Returns a non-mutating shared-runtime resolution receipt.',
};
