import { createHash } from 'node:crypto';

export const SHARED_CAPABILITY_RUNTIME_RECEIPT = 'fcr/shared-capability-runtime-receipt@v1' as const;
export const SHARED_CAPABILITY_PRESENTATION = 'fcr/shared-capability-presentation@v1' as const;

export const INTERACTION_SURFACES = [
  'voice',
  'text',
  'mobile',
  'desktop',
  'automation',
  'future',
] as const;

export type InteractionSurface = typeof INTERACTION_SURFACES[number];
export type SharedCapabilityRuntimeErrorCode =
  | 'shared_runtime_invalid_request'
  | 'shared_runtime_authority_denied';

export class SharedCapabilityRuntimeError extends Error {
  constructor(
    public readonly code: SharedCapabilityRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SharedCapabilityRuntimeError';
  }
}

export interface SharedRuntimeFounderIdentity {
  userId: string;
  email: string;
}

export interface SharedReadOnlyInvocationInput {
  executionId: string;
  capabilityId: string;
  surface?: unknown;
  intent: string;
  founder?: SharedRuntimeFounderIdentity;
}

export interface PreparedSharedReadOnlyInvocation {
  executionId: string;
  capabilityId: string;
  surface: InteractionSurface;
  intentFingerprint: string;
  authority: {
    mode: 'read_only';
    consequence: 'READ';
    mutationAllowed: false;
    approvalRequired: false;
    checkedAt: string;
    founderSubjectFingerprint: string;
    authorityRevision: string;
  };
}

export interface SharedReadOnlyObservation {
  provider: string;
  providerAccepted: true;
  truthState: string;
  requestFingerprint: string;
  resultCount: number;
  continuity: {
    evidenceFingerprint: string;
    proofCookie: string;
    transition: string;
    authorityEffect: 'none';
  };
}

export interface SharedCapabilityRuntimeReceipt {
  contract: typeof SHARED_CAPABILITY_RUNTIME_RECEIPT;
  executionId: string;
  capabilityId: string;
  surface: InteractionSurface;
  state: 'PROVIDER_ACCEPTED';
  intentFingerprint: string;
  authority: PreparedSharedReadOnlyInvocation['authority'];
  provider: {
    name: string;
    accepted: true;
    requestFingerprint: string;
  };
  evidence: {
    truthState: string;
    evidenceFingerprint: string;
    proofCookie: string;
    continuityTransition: string;
    authorityEffect: 'none';
  };
  completionClaim: {
    allowed: false;
    reason: 'provider_observation_unverified';
  };
}

export interface SharedCapabilityPresentation {
  contract: typeof SHARED_CAPABILITY_PRESENTATION;
  surface: InteractionSurface;
  channel: 'speech_and_text' | 'text';
  summary: string;
  dataRef: 'run.observation.data';
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function normalizeSurface(value: unknown): InteractionSurface {
  if (value === undefined || value === null || value === '') return 'text';
  if (typeof value !== 'string' || !INTERACTION_SURFACES.includes(value as InteractionSurface)) {
    throw new SharedCapabilityRuntimeError(
      'shared_runtime_invalid_request',
      `surface must be one of: ${INTERACTION_SURFACES.join(', ')}`,
    );
  }
  return value as InteractionSurface;
}

function founderSubject(identity: SharedRuntimeFounderIdentity | undefined): string {
  const userId = identity?.userId?.trim() ?? '';
  const email = identity?.email?.trim().toLowerCase() ?? '';
  if (!userId || !email) {
    throw new SharedCapabilityRuntimeError(
      'shared_runtime_authority_denied',
      'Shared capability runtime requires a current server-authenticated founder identity.',
    );
  }
  return sha256({ userId, email });
}

export function prepareSharedReadOnlyCapabilityRun(
  input: SharedReadOnlyInvocationInput,
): PreparedSharedReadOnlyInvocation {
  const executionId = input.executionId.trim();
  const capabilityId = input.capabilityId.trim();
  const intent = input.intent.trim();
  if (!executionId || !capabilityId || !intent || intent.length > 4_096) {
    throw new SharedCapabilityRuntimeError(
      'shared_runtime_invalid_request',
      'executionId, capabilityId, and a bounded intent are required.',
    );
  }

  const surface = normalizeSurface(input.surface);
  const founderSubjectFingerprint = founderSubject(input.founder);
  const checkedAt = new Date().toISOString();
  const authorityRevision = sha256({
    founderSubjectFingerprint,
    capabilityId,
    authority: 'read_only',
    consequence: 'READ',
    mutationAllowed: false,
    approvalRequired: false,
  });

  return {
    executionId,
    capabilityId,
    surface,
    intentFingerprint: sha256({ capabilityId, intent }),
    authority: {
      mode: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      approvalRequired: false,
      checkedAt,
      founderSubjectFingerprint,
      authorityRevision,
    },
  };
}

export function finalizeSharedReadOnlyCapabilityRun(
  prepared: PreparedSharedReadOnlyInvocation,
  observation: SharedReadOnlyObservation,
): { receipt: SharedCapabilityRuntimeReceipt; presentation: SharedCapabilityPresentation } {
  if (observation.continuity.authorityEffect !== 'none') {
    throw new SharedCapabilityRuntimeError(
      'shared_runtime_authority_denied',
      'Read-only provider evidence cannot change shared runtime authority.',
    );
  }

  const receipt: SharedCapabilityRuntimeReceipt = {
    contract: SHARED_CAPABILITY_RUNTIME_RECEIPT,
    executionId: prepared.executionId,
    capabilityId: prepared.capabilityId,
    surface: prepared.surface,
    state: 'PROVIDER_ACCEPTED',
    intentFingerprint: prepared.intentFingerprint,
    authority: prepared.authority,
    provider: {
      name: observation.provider,
      accepted: observation.providerAccepted,
      requestFingerprint: observation.requestFingerprint,
    },
    evidence: {
      truthState: observation.truthState,
      evidenceFingerprint: observation.continuity.evidenceFingerprint,
      proofCookie: observation.continuity.proofCookie,
      continuityTransition: observation.continuity.transition,
      authorityEffect: observation.continuity.authorityEffect,
    },
    completionClaim: {
      allowed: false,
      reason: 'provider_observation_unverified',
    },
  };

  const count = Number.isFinite(observation.resultCount) ? Math.max(0, observation.resultCount) : 0;
  const presentation: SharedCapabilityPresentation = {
    contract: SHARED_CAPABILITY_PRESENTATION,
    surface: prepared.surface,
    channel: prepared.surface === 'voice' ? 'speech_and_text' : 'text',
    summary: `Observed ${count} result${count === 1 ? '' : 's'} through ${observation.provider}. Provider acceptance is not a verified founder outcome.`,
    dataRef: 'run.observation.data',
  };

  return { receipt, presentation };
}
