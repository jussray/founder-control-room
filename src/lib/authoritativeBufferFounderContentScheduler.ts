import {
  claimFounderContentApproval,
  type FounderContentApprovalRepository,
} from './founderContentApprovalStore.js';
import {
  readN8nFounderContentConfig,
  type N8nFounderContentRequest,
  type VerifiedN8nFounderContentReceipt,
} from './n8nFounderContentOrchestrator.js';
import {
  dispatchProviderNeutralN8nFounderContent,
  readN8nFounderContentProviderConfig,
} from './n8nProviderNeutralFounderContentOrchestrator.js';

export const AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT =
  'fcr/authoritative-buffer-founder-content@v1' as const;

const BUFFER_PROVIDER = 'buffer' as const;

type JsonRecord = Record<string, unknown>;

export interface AuthoritativeBufferFounderContentScheduleInput {
  proposal: JsonRecord;
  approval_id: string;
  confirmation: {
    confirm_schedule?: boolean;
    authorization_hash?: string;
    public_payload_hash?: string;
  };
}

export interface AuthoritativeBufferFounderContentScheduleOptions {
  founderUserId: string;
  founderIdentity: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  approvalRepository?: FounderContentApprovalRepository;
  now?: string;
}

export interface AuthoritativeBufferFounderContentScheduleResult {
  ok: boolean;
  code: string;
  status: number;
  contract: typeof AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT;
  transport: typeof BUFFER_PROVIDER;
  published: false;
  approvalConsumed: boolean;
  freshApprovalRequiredForRetry: boolean;
  request: N8nFounderContentRequest | null;
  receipt: VerifiedN8nFounderContentReceipt | null;
  reasons: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function blocked({
  code,
  status,
  reasons,
  approvalConsumed = false,
  request = null,
  receipt = null,
}: {
  code: string;
  status: number;
  reasons: string[];
  approvalConsumed?: boolean;
  request?: N8nFounderContentRequest | null;
  receipt?: VerifiedN8nFounderContentReceipt | null;
}): AuthoritativeBufferFounderContentScheduleResult {
  return {
    ok: false,
    code,
    status,
    contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
    transport: BUFFER_PROVIDER,
    published: false,
    approvalConsumed,
    freshApprovalRequiredForRetry: approvalConsumed,
    request,
    receipt,
    reasons,
  };
}

function assertBufferOnlyRuntime(env: NodeJS.ProcessEnv): string[] {
  const transport = readN8nFounderContentConfig(env);
  const providers = readN8nFounderContentProviderConfig(env);
  const reasons: string[] = [];

  if (!transport.enabled) reasons.push('Buffer founder-content orchestration is disabled');
  if (!transport.configured || !transport.webhookUrl || !transport.bearerToken) {
    reasons.push('Buffer founder-content webhook and bearer token must be configured');
  }
  if (providers.invalidProviders.length > 0) {
    reasons.push(`provider allowlist contains unsupported values: ${providers.invalidProviders.join(', ')}`);
  }
  if (
    providers.enabledProviders.length !== 1 ||
    providers.enabledProviders[0] !== BUFFER_PROVIDER
  ) {
    reasons.push('Buffer must be the only runtime-enabled founder-content transport');
  }

  return reasons;
}

/**
 * Current first-party founder-content execution membrane.
 *
 * Chief AI proposes. FCR issues and stores the exact approval. This function
 * preflights the only currently authorized transport (Buffer) before consuming
 * that one-shot approval, then injects the trusted stored approval into the
 * existing governed scheduler. Caller-supplied approval objects are ignored.
 */
export async function dispatchAuthoritativeBufferFounderContentSchedule(
  input: AuthoritativeBufferFounderContentScheduleInput,
  options: AuthoritativeBufferFounderContentScheduleOptions,
): Promise<AuthoritativeBufferFounderContentScheduleResult> {
  const founderUserId = text(options.founderUserId);
  const founderIdentity = text(options.founderIdentity).toLowerCase();
  const approvalId = text(input.approval_id).toLowerCase();
  const authorizationHash = text(input.confirmation?.authorization_hash).toLowerCase();
  const publicPayloadHash = text(input.confirmation?.public_payload_hash).toLowerCase();
  const now = options.now ?? new Date().toISOString();
  const env = options.env ?? process.env;

  const reasons: string[] = [];
  if (!founderUserId) reasons.push('authenticated founder user id is required');
  if (!founderIdentity) reasons.push('authenticated founder execution identity is required');
  if (!approvalId) reasons.push('approval_id must reference an FCR-issued approval');
  if (input.confirmation?.confirm_schedule !== true) reasons.push('confirm_schedule must be true');
  if (!authorizationHash) reasons.push('authorization_hash confirmation is required');
  if (!publicPayloadHash) reasons.push('public_payload_hash confirmation is required');
  if (reasons.length > 0) {
    return blocked({ code: 'INVALID_AUTHORIZATION', status: 409, reasons });
  }

  const runtimeReasons = assertBufferOnlyRuntime(env);
  if (runtimeReasons.length > 0) {
    return blocked({
      code: 'BUFFER_TRANSPORT_NOT_READY',
      status: 503,
      reasons: [
        ...runtimeReasons,
        'approval was not consumed because Buffer transport preflight did not pass',
      ],
    });
  }

  const claim = await claimFounderContentApproval({
    proposal: input.proposal,
    founderUserId,
    approvalId,
    authorizationHash,
    expectedPublicPayloadHash: publicPayloadHash,
    consumedBy: `${founderIdentity}:buffer-schedule`,
    now,
    repository: options.approvalRepository,
  });

  if (!claim.ok) {
    return blocked({
      code: 'APPROVAL_NOT_CURRENT',
      status: 409,
      reasons: [
        'Buffer scheduling stopped because FCR could not claim a current authoritative ApprovalReceipt',
        claim.reason,
      ],
    });
  }

  if (
    claim.publicPayloadHash !== publicPayloadHash ||
    claim.authorizationHash !== authorizationHash
  ) {
    return blocked({
      code: 'APPROVAL_HASH_MISMATCH',
      status: 409,
      approvalConsumed: true,
      reasons: [
        'claimed authoritative approval does not match the exact founder confirmation',
        'a fresh approval is required before any retry',
      ],
    });
  }

  const dispatch = await dispatchProviderNeutralN8nFounderContent({
    proposal: input.proposal,
    approval: claim.approval,
    now,
    n8n_provider: BUFFER_PROVIDER,
  }, {
    env,
    fetchImpl: options.fetchImpl,
    executedBy: founderIdentity,
  });

  if (!dispatch.ok) {
    return blocked({
      code: dispatch.code,
      status: dispatch.status,
      approvalConsumed: true,
      request: dispatch.request,
      receipt: dispatch.receipt,
      reasons: [
        ...dispatch.reasons,
        'the one-shot FCR approval was consumed; do not blindly retry this authorization',
        'issue a fresh approval only after reconciling any ambiguous provider outcome',
      ],
    });
  }

  return {
    ok: true,
    code: 'BUFFER_SCHEDULE_ACCEPTED',
    status: 202,
    contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
    transport: BUFFER_PROVIDER,
    published: false,
    approvalConsumed: true,
    freshApprovalRequiredForRetry: false,
    request: dispatch.request,
    receipt: dispatch.receipt,
    reasons: [
      'Buffer accepted the governed schedule request',
      'published remains false until provider readback proves terminal external state',
    ],
  };
}
