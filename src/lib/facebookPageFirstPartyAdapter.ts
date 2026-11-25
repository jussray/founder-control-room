import type {
  FirstPartyPlatformAdapter,
  FirstPartyPublicationReceipt,
  PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';

// Meta Page access tokens are server-held. This adapter never accepts a caller-selected token or Page.
const NUMERIC_ID = /^[0-9]{1,24}$/;
const POST_ID = /^([0-9]{1,24})_([0-9]{1,30})$/;
const GRAPH_VERSION = /^v[0-9]{1,2}\.[0-9]{1,2}$/;
const SHA = /^[0-9a-f]{40}$/i;
const DIGEST = /^[0-9a-f]{64}$/i;

export interface FacebookPageFirstPartyAdapterConfig {
  accessToken: string;
  pageId: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Phase = 'validate' | 'identity' | 'write' | 'write-receipt' | 'readback' | 'readback-verify';

export class FacebookPageFirstPartyAdapterError extends Error {
  readonly code: string;
  readonly truthState: 'FAILED' | 'UNKNOWN';
  readonly retrySafe = false;
  readonly evidence: {
    phase: Phase;
    postId: string | null;
    permalink: string | null;
    httpStatus: number | null;
  };

  constructor(
    code: string,
    truthState: 'FAILED' | 'UNKNOWN',
    phase: Phase,
    postId: string | null = null,
    httpStatus: number | null = null,
  ) {
    super(code); // Never leak access tokens or raw provider response bodies.
    this.name = 'FacebookPageFirstPartyAdapterError';
    this.code = code;
    this.truthState = truthState;
    this.evidence = { phase, postId, permalink: null, httpStatus };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function timeout(ms: number | undefined): number {
  return Number.isInteger(ms) && ms! >= 1000 && ms! <= 30000 ? ms! : 10000;
}

function validFacebookPermalink(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function validatePrepared(
  prepared: PreparedFirstPartyPublication,
  config: FacebookPageFirstPartyAdapterConfig,
): void {
  if (
    prepared.platform !== 'facebook' || prepared.mode !== 'publish' ||
    prepared.contentField !== 'facebook_draft' ||
    !NUMERIC_ID.test(config.pageId) || prepared.accountId !== config.pageId ||
    !GRAPH_VERSION.test(config.apiVersion) || !config.accessToken?.trim() ||
    !prepared.founderApprovalId?.trim() ||
    !DIGEST.test(prepared.contentHash) || !DIGEST.test(prepared.idempotencyKey) ||
    !SHA.test(prepared.sourceCommitSha) ||
    !prepared.text?.trim() || !Number.isInteger(prepared.characterLimit) ||
    prepared.characterLimit < 1 || prepared.text.length > prepared.characterLimit ||
    prepared.media?.length !== 0
  ) {
    throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_PUBLICATION_INPUT_REJECTED', 'FAILED', 'validate');
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return asRecord(await response.json());
}

export function createFacebookPageFirstPartyAdapter(
  config: FacebookPageFirstPartyAdapterConfig,
): FirstPartyPlatformAdapter {
  return {
    platform: 'facebook',
    async publish(prepared): Promise<FirstPartyPublicationReceipt> {
      validatePrepared(prepared, config);
      const fetchImpl = config.fetchImpl ?? fetch;
      const base = `https://graph.facebook.com/${config.apiVersion}`;
      const headers = { Authorization: `Bearer ${config.accessToken}` };
      const ms = timeout(config.timeoutMs);

      // Establish Page identity BEFORE any external write. User-profile tokens must not pass.
      let identity: Response;
      try {
        identity = await fetchImpl(`${base}/me?fields=id%2Cname`, {
          method: 'GET', headers, signal: AbortSignal.timeout(ms),
        });
      } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_IDENTITY_UNAVAILABLE', 'FAILED', 'identity');
      }
      if (!identity.ok) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_IDENTITY_REJECTED', 'FAILED', 'identity', null, identity.status);
      }
      let actor: Record<string, unknown>;
      try { actor = await readJson(identity); } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_IDENTITY_INVALID', 'FAILED', 'identity');
      }
      if (actor.id !== config.pageId) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_ACCOUNT_ID_MISMATCH', 'FAILED', 'identity');
      }

      let created: Response;
      try {
        created = await fetchImpl(`${base}/${config.pageId}/feed`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ message: prepared.text, published: 'true' }).toString(),
          signal: AbortSignal.timeout(ms),
        });
      } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_WRITE_OUTCOME_UNKNOWN', 'UNKNOWN', 'write');
      }
      if (created.status >= 500) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_WRITE_SERVER_OUTCOME_UNKNOWN', 'UNKNOWN', 'write', null, created.status);
      }
      if (!created.ok) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_WRITE_REJECTED', 'FAILED', 'write', null, created.status);
      }
      let writeData: Record<string, unknown>;
      try { writeData = await readJson(created); } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_WRITE_RECEIPT_INVALID', 'UNKNOWN', 'write-receipt', null, created.status);
      }
      const postId = typeof writeData.id === 'string' ? writeData.id : '';
      const match = POST_ID.exec(postId);
      if (!match || match[1] !== config.pageId) {
        throw new FacebookPageFirstPartyAdapterError(
          'FACEBOOK_PAGE_WRITE_RECEIPT_MISMATCH', 'UNKNOWN', 'write-receipt', match ? postId : null, created.status,
        );
      }

      // Receipt must come from a separate provider GET. Never treat POST 200 as publication proof.
      let readback: Response;
      try {
        readback = await fetchImpl(
          `${base}/${postId}?fields=id%2Cmessage%2Ccreated_time%2Cpermalink_url%2Cfrom%2Cis_published`,
          { method: 'GET', headers, signal: AbortSignal.timeout(ms) },
        );
      } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_READBACK_UNAVAILABLE', 'UNKNOWN', 'readback', postId);
      }
      if (!readback.ok) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_READBACK_REJECTED', 'UNKNOWN', 'readback', postId, readback.status);
      }
      let observed: Record<string, unknown>;
      try { observed = await readJson(readback); } catch {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_READBACK_INVALID', 'UNKNOWN', 'readback', postId, readback.status);
      }
      const from = asRecord(observed.from);
      const timestamp = typeof observed.created_time === 'string' ? observed.created_time : '';
      if (
        observed.id !== postId || from.id !== config.pageId ||
        observed.message !== prepared.text || observed.is_published !== true ||
        !validFacebookPermalink(observed.permalink_url) ||
        !timestamp || !Number.isFinite(Date.parse(timestamp))
      ) {
        throw new FacebookPageFirstPartyAdapterError('FACEBOOK_PAGE_READBACK_MISMATCH', 'UNKNOWN', 'readback-verify', postId, readback.status);
      }

      return {
        platform: 'facebook',
        externalPostId: postId,
        permalink: observed.permalink_url,
        providerRequestId: created.headers.get('x-fb-trace-id') || readback.headers.get('x-fb-trace-id'),
        publishedAt: new Date(timestamp).toISOString(),
        contentHash: prepared.contentHash,
        sourceCommitSha: prepared.sourceCommitSha,
        proofUrls: prepared.proofUrls,
      };
    },
  };
}
