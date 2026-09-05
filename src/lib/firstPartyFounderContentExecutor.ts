import { createHash } from 'node:crypto';
import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  executeFirstPartyPublication,
  type FirstPartyPublicationReceipt,
  type PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';
import {
  LinkedInFirstPartyAdapterError,
  createLinkedInFirstPartyAdapter,
} from './linkedinFirstPartyAdapter.js';
// @ts-expect-error -- canonical founder-content authority is the provider-neutral CommonJS firewall contract.
import founderContentAuthorizationContract from '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

export const FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT =
  'fcr/first-party-founder-content-publish@v1' as const;
export const FIRST_PARTY_FOUNDER_PUBLISH_ACTION = 'publish_founder_content' as const;

const HASH = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const LINKEDIN_AUTHOR_URN = /^urn:li:(person|organization):[A-Za-z0-9_-]+$/;
const LINKEDIN_API_VERSION = /^20\d{4}$/;
const MAX_CURRENT_YOU_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

interface CanonicalFounderContentContract {
  authorizeFounderContentPublication(input: {
    proposal: JsonRecord;
    approval: JsonRecord;
    now: string;
  }): JsonRecord;
  canonicalChiefIdentity(proposal: JsonRecord): JsonRecord;
}

const canonicalFounderContent =
  founderContentAuthorizationContract as CanonicalFounderContentContract;

export interface FirstPartyFounderPublishInput {
  proposal: JsonRecord;
  approval: JsonRecord;
  confirmation: {
    confirm_publication?: boolean;
    authorization_hash?: string;
    public_payload_hash?: string;
  };
  current_you: {
    authenticated?: boolean;
    source?: string;
    intent_id?: string;
    intent_version?: number;
    observed_at?: string;
  };
}

export interface FounderContentReservationInput {
  sourceRepo: string;
  idempotencyKey: string;
  executedBy: string;
  request: JsonRecord;
}

export type FounderContentReservationResult =
  | { ok: true; executionId: string; projectId: string }
  | {
      ok: false;
      code:
        | 'SOURCE_PROJECT_UNRESOLVED'
        | 'ACTION_ALREADY_RESERVED'
        | 'ACTION_RESERVATION_FAILED';
      reason: string;
    };

export interface FounderContentExecutionStore {
  reserve(input: FounderContentReservationInput): Promise<FounderContentReservationResult>;
  finalize(
    executionId: string,
    status: 'succeeded' | 'failed',
    result: JsonRecord,
    success: boolean,
  ): Promise<boolean>;
}

export interface FirstPartyFounderPublishOptions {
  env?: NodeJS.ProcessEnv;
  executedBy?: string;
  now?: string;
  fetchImpl?: typeof fetch;
  store?: FounderContentExecutionStore;
}

export interface FirstPartyFounderPublishResult {
  ok: boolean;
  code:
    | 'PUBLISHED'
    | 'INVALID_AUTHORIZATION'
    | 'EXECUTION_CONTEXT_REQUIRED'
    | 'LINKEDIN_NOT_CONFIGURED'
    | 'SOURCE_PROJECT_UNRESOLVED'
    | 'ACTION_ALREADY_RESERVED'
    | 'ACTION_RESERVATION_FAILED'
    | 'PROVIDER_REJECTED'
    | 'PROVIDER_OUTCOME_UNKNOWN'
    | 'ACTION_AUDIT_INCOMPLETE';
  status: number;
  contract: typeof FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT;
  truthState: 'PUBLISHED' | 'FAILED' | 'UNKNOWN' | 'BLOCKED';
  published: boolean;
  retrySafe: false;
  freshApprovalMayRetry: boolean;
  executionId: string | null;
  receipt: FirstPartyPublicationReceipt | null;
  providerEvidence: JsonRecord | null;
  reasons: string[];
}

interface ValidatedAuthority {
  canonicalAuthorization: JsonRecord;
  sourceRepo: string;
  sourceCommitSha: string;
  authorizationHash: string;
  publicPayloadHash: string;
  publicCopyHash: string;
  approvalId: string;
  text: string;
  proofUrl: string | null;
  authorUrn: string;
  accessToken: string;
  apiVersion: string | undefined;
  idempotencyKey: string;
  prepared: PreparedFirstPartyPublication;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exactTextHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validTime(value: unknown): { iso: string; ms: number } | null {
  const raw = text(value);
  const ms = Date.parse(raw);
  if (!raw || !Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function invalid(reasons: string[]): Error {
  return new Error(`FIRST_PARTY_FOUNDER_PUBLISH_REJECTED: ${reasons.join('; ')}`);
}

function linkedinConfig(env: NodeJS.ProcessEnv) {
  const accessToken = text(env.LINKEDIN_ACCESS_TOKEN);
  const authorUrn = text(env.LINKEDIN_AUTHOR_URN);
  const apiVersion = text(env.LINKEDIN_API_VERSION) || undefined;
  return { accessToken, authorUrn, apiVersion };
}

function validateAuthority(
  input: FirstPartyFounderPublishInput,
  env: NodeJS.ProcessEnv,
  nowIso: string,
): ValidatedAuthority {
  const reasons: string[] = [];
  const now = validTime(nowIso);
  if (!now) throw invalid(['now must be a valid RFC3339 timestamp']);

  const canonicalAuthorization = canonicalFounderContent.authorizeFounderContentPublication({
    proposal: input.proposal,
    approval: input.approval,
    now: now.iso,
  });
  const chiefIdentity = canonicalFounderContent.canonicalChiefIdentity(input.proposal);
  const publicPayload = record(chiefIdentity.public_payload);
  const source = record(canonicalAuthorization.source);
  const content = record(canonicalAuthorization.content);
  const approvedCurrentYou = record(canonicalAuthorization.current_you);

  const sourceRepo = text(source.repo);
  const sourceCommitSha = text(source.commit_sha).toLowerCase();
  const authorizationHash = text(canonicalAuthorization.authorization_hash).toLowerCase();
  const publicPayloadHash = text(canonicalAuthorization.public_payload_hash).toLowerCase();
  const approvalId = text(canonicalAuthorization.approval_id);
  const platform = text(content.platform).toLowerCase();
  const approvedText = text(content.text);
  const canonicalText = text(publicPayload.draft_text);
  const proofUrl = text(publicPayload.proof_link) || null;
  const proofPolicy = text(publicPayload.proof_link_policy);
  const currentYou = record(input.current_you);
  const currentObserved = validTime(currentYou.observed_at);
  const approvedObserved = validTime(approvedCurrentYou.observed_at);
  const approvedExpires = validTime(canonicalAuthorization.expires_at);
  const config = linkedinConfig(env);

  if (canonicalAuthorization.kind !== 'fcr/founder-content-publication-authorization') {
    reasons.push('canonical publication authorization kind is invalid');
  }
  if (canonicalAuthorization.state !== 'authorized-for-scheduled-review') {
    reasons.push('canonical authorization must begin at scheduled-review authority');
  }
  if (!HASH.test(authorizationHash)) reasons.push('canonical authorization_hash is invalid');
  if (!HASH.test(publicPayloadHash)) reasons.push('canonical public_payload_hash is invalid');
  if (!OWNED_REPO.test(sourceRepo)) reasons.push('source repo must be owned by jussray');
  if (!FULL_SHA.test(sourceCommitSha)) reasons.push('source commit must be exact');
  if (platform !== 'linkedin') reasons.push('first-party direct slice currently supports LinkedIn only');
  if (!approvedText || canonicalText !== approvedText) {
    reasons.push('canonical approved copy must match the exact Chief public payload');
  }
  if (stableHash(publicPayload) !== publicPayloadHash) {
    reasons.push('canonical public payload no longer matches its approved hash');
  }
  if (proofPolicy !== 'editorial_optional') {
    reasons.push('founder-content proof-link policy must remain editorial_optional');
  }
  if (proofUrl && !validHttpsUrl(proofUrl)) reasons.push('optional proof link must be HTTPS');
  if (approvedText.length > FIRST_PARTY_PLATFORM_CAPABILITIES.linkedin.safeCharacterLimit!) {
    reasons.push('approved LinkedIn copy exceeds the first-party safe character limit');
  }

  if (input.confirmation?.confirm_publication !== true) {
    reasons.push('confirm_publication must be true');
  }
  if (text(input.confirmation?.authorization_hash).toLowerCase() !== authorizationHash) {
    reasons.push('confirmation authorization_hash must match the exact canonical approval');
  }
  if (text(input.confirmation?.public_payload_hash).toLowerCase() !== publicPayloadHash) {
    reasons.push('confirmation public_payload_hash must match the exact approved copy');
  }

  if (currentYou.authenticated !== true) reasons.push('Current You must be authenticated');
  if (text(currentYou.source) !== 'current_authenticated_founder') {
    reasons.push('Current You source must be current_authenticated_founder');
  }
  if (text(currentYou.intent_id) !== text(approvedCurrentYou.intent_id)) {
    reasons.push('Current You intent id no longer matches the approved content');
  }
  if (currentYou.intent_version !== approvedCurrentYou.intent_version) {
    reasons.push('Current You intent version no longer matches the approved content');
  }
  if (!currentObserved || !approvedObserved) {
    reasons.push('Current You observation timestamps must be valid');
  } else {
    if (currentObserved.ms < approvedObserved.ms) {
      reasons.push('Current You must be re-read at or after the approval observation');
    }
    if (currentObserved.ms > now.ms + MAX_CLOCK_SKEW_MS) {
      reasons.push('Current You observation is future-dated');
    }
    if (now.ms - currentObserved.ms > MAX_CURRENT_YOU_AGE_MS) {
      reasons.push('Current You observation is stale');
    }
  }
  if (!approvedExpires || now.ms >= approvedExpires.ms) {
    reasons.push('canonical publication authorization is expired');
  }

  if (!config.accessToken) reasons.push('LINKEDIN_ACCESS_TOKEN is not configured server-side');
  if (!LINKEDIN_AUTHOR_URN.test(config.authorUrn)) {
    reasons.push('LINKEDIN_AUTHOR_URN is not configured as a valid member or organization URN');
  }
  if (config.apiVersion && !LINKEDIN_API_VERSION.test(config.apiVersion)) {
    reasons.push('LINKEDIN_API_VERSION is not configured as a valid YYYYMM version');
  }

  if (reasons.length > 0) throw invalid(reasons);

  // This is the exact canonical provider text only. It deliberately excludes
  // claims, evidence, source SHA, proof URLs, provider account, and other
  // metadata so a provider-verified publication can remain exact-copy memory
  // even when surrounding evidence or proposal metadata later rotates.
  const publicCopyHash = exactTextHash(approvedText);
  const contentHash = stableHash({
    contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
    authorizationHash,
    publicPayloadHash,
    platform: 'linkedin',
    accountId: config.authorUrn,
    text: approvedText,
    sourceRepo,
    sourceCommitSha,
  });
  const idempotencyKey = stableHash({
    kind: 'fcr/founder-content-publish-now-idempotency@v1',
    authorizationHash,
    publicPayloadHash,
    provider: 'linkedin',
    providerAccountId: config.authorUrn,
    sourceRepo,
    sourceCommitSha,
  });
  const proofUrls = proofUrl ? [proofUrl] : [];
  const prepared: PreparedFirstPartyPublication = {
    platform: 'linkedin',
    accountId: config.authorUrn,
    contentField: 'linkedin_draft',
    text: approvedText,
    traction: 'canonical-founder-content-proposal',
    governanceAdvantage: 'exact-current-you-plus-provider-readback',
    audienceValue: 'exact-approved-public-copy',
    investorSignal: 'first-party-governed-distribution',
    proofLinks: proofUrl ? [{ label: 'Public proof', url: proofUrl }] : [],
    proofUrls,
    sourceRepository: sourceRepo,
    sourceCommitSha,
    mode: 'publish',
    founderApprovalId: approvalId,
    media: [],
    characterLimit: FIRST_PARTY_PLATFORM_CAPABILITIES.linkedin.safeCharacterLimit!,
    contentHash,
    idempotencyKey,
    capability: FIRST_PARTY_PLATFORM_CAPABILITIES.linkedin,
  };

  return {
    canonicalAuthorization,
    sourceRepo,
    sourceCommitSha,
    authorizationHash,
    publicPayloadHash,
    publicCopyHash,
    approvalId,
    text: approvedText,
    proofUrl,
    authorUrn: config.authorUrn,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    idempotencyKey,
    prepared,
  };
}

async function defaultStore(): Promise<FounderContentExecutionStore> {
  const { supabase } = await import('./supabaseClient.js');

  return {
    async reserve(input) {
      const { data: projects, error: projectError } = await supabase
        .from('projects')
        .select('id, repo_identifier')
        .eq('repo_identifier', input.sourceRepo)
        .limit(2);
      if (projectError || !projects || projects.length !== 1) {
        return {
          ok: false,
          code: 'SOURCE_PROJECT_UNRESOLVED',
          reason: projectError
            ? `source project lookup failed: ${projectError.message}`
            : `source repository ${input.sourceRepo} must resolve to exactly one FCR project`,
        };
      }
      const projectId = String(projects[0].id);

      const lookup = async () => {
        const { data, error } = await supabase
          .from('approval_executions')
          .select('id, action_type, status')
          .eq('idempotency_key', input.idempotencyKey)
          .maybeSingle();
        return { data: data as { id?: string; action_type?: string; status?: string } | null, error };
      };

      const existing = await lookup();
      if (existing.error) {
        return {
          ok: false,
          code: 'ACTION_RESERVATION_FAILED',
          reason: `founder-content reservation lookup failed: ${existing.error.message}`,
        };
      }
      if (existing.data) {
        return {
          ok: false,
          code: 'ACTION_ALREADY_RESERVED',
          reason: `exact founder-content approval is already ${existing.data.status ?? 'reserved'}; no second provider write is allowed`,
        };
      }

      const { data, error } = await supabase
        .from('approval_executions')
        .insert({
          mission_id: null,
          project_id: projectId,
          action_type: FIRST_PARTY_FOUNDER_PUBLISH_ACTION,
          idempotency_key: input.idempotencyKey,
          executed_by: input.executedBy,
          status: 'pending',
          request: input.request,
          result: {},
          success: null,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        const raced = await lookup();
        if (!raced.error && raced.data?.id) {
          return {
            ok: false,
            code: 'ACTION_ALREADY_RESERVED',
            reason: 'exact founder-content approval was reserved concurrently; no second provider write is allowed',
          };
        }
        return {
          ok: false,
          code: 'ACTION_RESERVATION_FAILED',
          reason: error?.message ?? 'founder-content reservation was not persisted',
        };
      }
      return { ok: true, executionId: String(data.id), projectId };
    },

    async finalize(executionId, status, result, success) {
      const { data, error } = await supabase
        .from('approval_executions')
        .update({
          status,
          result,
          success,
          executed_at: new Date().toISOString(),
        })
        .eq('id', executionId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      return !error && String(data?.id ?? '') === executionId;
    },
  };
}

function blocked(
  code: FirstPartyFounderPublishResult['code'],
  status: number,
  reasons: string[],
): FirstPartyFounderPublishResult {
  return {
    ok: false,
    code,
    status,
    contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
    truthState: 'BLOCKED',
    published: false,
    retrySafe: false,
    freshApprovalMayRetry: false,
    executionId: null,
    receipt: null,
    providerEvidence: null,
    reasons,
  };
}

export async function dispatchFirstPartyFounderContentPublishNow(
  input: FirstPartyFounderPublishInput,
  options: FirstPartyFounderPublishOptions = {},
): Promise<FirstPartyFounderPublishResult> {
  const executedBy = text(options.executedBy).toLowerCase();
  if (!executedBy) {
    return blocked(
      'EXECUTION_CONTEXT_REQUIRED',
      500,
      ['server-authenticated founder identity is required before an external publication'],
    );
  }

  const now = options.now ?? new Date().toISOString();
  let authority: ValidatedAuthority;
  try {
    authority = validateAuthority(input, options.env ?? process.env, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid founder-content authorization';
    const code = message.includes('LINKEDIN_ACCESS_TOKEN')
      || message.includes('LINKEDIN_AUTHOR_URN')
      || message.includes('LINKEDIN_API_VERSION')
      ? 'LINKEDIN_NOT_CONFIGURED'
      : 'INVALID_AUTHORIZATION';
    return blocked(code, code === 'LINKEDIN_NOT_CONFIGURED' ? 503 : 400, [message]);
  }

  const store = options.store ?? (await defaultStore());
  const reservation = await store.reserve({
    sourceRepo: authority.sourceRepo,
    idempotencyKey: authority.idempotencyKey,
    executedBy,
    request: {
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      action: FIRST_PARTY_FOUNDER_PUBLISH_ACTION,
      sourceRepo: authority.sourceRepo,
      sourceCommitSha: authority.sourceCommitSha,
      authorizationHash: authority.authorizationHash,
      publicPayloadHash: authority.publicPayloadHash,
      publicCopyHash: authority.publicCopyHash,
      approvalId: authority.approvalId,
      platform: 'linkedin',
      providerAccountId: authority.authorUrn,
      contentHash: authority.prepared.contentHash,
      idempotencyKey: authority.idempotencyKey,
    },
  });

  if (!reservation.ok) {
    return blocked(
      reservation.code,
      reservation.code === 'ACTION_RESERVATION_FAILED' ? 503 : 409,
      [reservation.reason],
    );
  }

  const adapter = createLinkedInFirstPartyAdapter({
    accessToken: authority.accessToken,
    authorUrn: authority.authorUrn,
    apiVersion: authority.apiVersion,
    fetchImpl: options.fetchImpl,
  });

  try {
    const receipt = await executeFirstPartyPublication(authority.prepared, {
      linkedin: adapter,
    });
    const result: JsonRecord = {
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      truthState: 'PUBLISHED',
      published: true,
      platform: 'linkedin',
      externalPostId: receipt.externalPostId,
      permalink: receipt.permalink,
      providerRequestId: receipt.providerRequestId,
      publishedAt: receipt.publishedAt,
      publicCopyHash: authority.publicCopyHash,
      contentHash: receipt.contentHash,
      sourceCommitSha: receipt.sourceCommitSha,
      proofUrls: receipt.proofUrls,
      retrySafe: false,
    };
    const auditPersisted = await store.finalize(
      reservation.executionId,
      'succeeded',
      result,
      true,
    );
    if (!auditPersisted) {
      return {
        ok: false,
        code: 'ACTION_AUDIT_INCOMPLETE',
        status: 500,
        contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
        truthState: 'PUBLISHED',
        published: true,
        retrySafe: false,
        freshApprovalMayRetry: false,
        executionId: reservation.executionId,
        receipt,
        providerEvidence: {
          externalPostId: receipt.externalPostId,
          permalink: receipt.permalink,
          publishedAt: receipt.publishedAt,
          auditPersisted: false,
        },
        reasons: ['provider readback proves publication, but FCR could not persist the final execution receipt; do not retry'],
      };
    }

    return {
      ok: true,
      code: 'PUBLISHED',
      status: 200,
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      truthState: 'PUBLISHED',
      published: true,
      retrySafe: false,
      freshApprovalMayRetry: false,
      executionId: reservation.executionId,
      receipt,
      providerEvidence: {
        externalPostId: receipt.externalPostId,
        permalink: receipt.permalink,
        providerRequestId: receipt.providerRequestId,
        publishedAt: receipt.publishedAt,
        auditPersisted: true,
      },
      reasons: [],
    };
  } catch (error) {
    const linkedInError = error instanceof LinkedInFirstPartyAdapterError ? error : null;
    const truthState = linkedInError?.truthState === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED';
    const providerEvidence: JsonRecord = linkedInError
      ? {
          phase: linkedInError.evidence.phase,
          postUrn: linkedInError.evidence.postUrn,
          permalink: linkedInError.evidence.permalink,
          httpStatus: linkedInError.evidence.httpStatus,
          retrySafe: false,
        }
      : { retrySafe: false };
    const result: JsonRecord = {
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      truthState,
      published: false,
      provider: 'linkedin',
      providerEvidence,
      errorCode: linkedInError?.code ?? 'FIRST_PARTY_PUBLICATION_REJECTED',
      retrySafe: false,
      freshApprovalRequired: truthState === 'FAILED',
    };
    const auditPersisted = await store.finalize(
      reservation.executionId,
      'failed',
      result,
      false,
    );

    return {
      ok: false,
      code: truthState === 'UNKNOWN' ? 'PROVIDER_OUTCOME_UNKNOWN' : 'PROVIDER_REJECTED',
      status: truthState === 'UNKNOWN' ? 202 : 502,
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      truthState,
      published: false,
      retrySafe: false,
      freshApprovalMayRetry: truthState === 'FAILED',
      executionId: reservation.executionId,
      receipt: null,
      providerEvidence: { ...providerEvidence, auditPersisted },
      reasons: [
        linkedInError?.code ?? (error instanceof Error ? error.message : 'first-party publication failed'),
        truthState === 'UNKNOWN'
          ? 'provider outcome is ambiguous; exact authorization is consumed and no blind retry is allowed'
          : 'provider rejected the write; a fresh Current-You approval is required before another attempt',
      ],
    };
  }
}
