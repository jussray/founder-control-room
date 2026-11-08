import type {
  FirstPartyPlatformAdapter,
  FirstPartyPublicationReceipt,
  PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';

export const X_ME_ENDPOINT = 'https://api.x.com/2/users/me' as const;
export const X_POSTS_ENDPOINT = 'https://api.x.com/2/tweets' as const;

const X_USER_ID = /^[0-9]{1,25}$/;
const X_POST_ID = /^[0-9]{1,25}$/;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const X_SAFE_TEXT_LIMIT = 270;

export type XPublicationTruthState = 'FAILED' | 'UNKNOWN';

export interface XFirstPartyAdapterConfig {
  /** OAuth 2.0 PKCE user-context bearer token. A developer API key is not sufficient. */
  accessToken: string;
  /** Explicit destination account. Must match /2/users/me BEFORE the provider write. */
  userId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface XPublicationEvidence {
  phase: 'identity' | 'write' | 'write-receipt' | 'readback' | 'readback-verify';
  postId: string | null;
  permalink: string | null;
  httpStatus: number | null;
}

export class XFirstPartyAdapterError extends Error {
  readonly code: string;
  readonly truthState: XPublicationTruthState;
  readonly retrySafe: boolean;
  readonly evidence: XPublicationEvidence;

  constructor(options: {
    code: string;
    truthState: XPublicationTruthState;
    evidence?: Partial<XPublicationEvidence>;
  }) {
    super(options.code);
    this.name = 'XFirstPartyAdapterError';
    this.code = options.code;
    this.truthState = options.truthState;
    // The publishing reservation is consumed on every attempted write. No blind retry.
    this.retrySafe = false;
    this.evidence = {
      phase: options.evidence?.phase ?? 'write',
      postId: options.evidence?.postId ?? null,
      permalink: options.evidence?.permalink ?? null,
      httpStatus: options.evidence?.httpStatus ?? null,
    };
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1_000 && value <= MAX_TIMEOUT_MS
    ? Math.trunc(value)
    : DEFAULT_TIMEOUT_MS;
}

function permalink(postId: string): string {
  return `https://x.com/i/web/status/${postId}`;
}

function validatePrepared(prepared: PreparedFirstPartyPublication, config: XFirstPartyAdapterConfig) {
  let reason = '';
  const accessToken = text(config.accessToken);
  const userId = text(config.userId);
  if (prepared.platform !== 'x') reason = 'X_ADAPTER_PLATFORM_MISMATCH';
  else if (prepared.mode !== 'publish' || !text(prepared.founderApprovalId)) reason = 'X_FOUNDER_APPROVAL_REQUIRED';
  else if (prepared.contentField !== 'x_draft') reason = 'X_CONTENT_FIELD_MISMATCH';
  else if (!accessToken) reason = 'X_USER_ACCESS_TOKEN_NOT_CONFIGURED';
  else if (!X_USER_ID.test(userId)) reason = 'X_USER_ID_INVALID';
  else if (prepared.accountId !== userId) reason = 'X_ACCOUNT_AUTHORITY_MISMATCH';
  else if (!prepared.text || prepared.text.length > X_SAFE_TEXT_LIMIT) reason = 'X_TEXT_LIMIT_INVALID';
  else if (prepared.media.length > 0) reason = 'X_TEXT_ONLY_ADAPTER_REJECTS_MEDIA';

  if (reason) throw new XFirstPartyAdapterError({ code: reason, truthState: 'FAILED' });
  return { accessToken, userId };
}

async function fetchJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function dataFrom(payload: Record<string, unknown> | null): Record<string, unknown> {
  const data = payload?.data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

export function createXFirstPartyAdapter(config: XFirstPartyAdapterConfig): FirstPartyPlatformAdapter {
  return {
    platform: 'x',
    async publish(prepared: PreparedFirstPartyPublication): Promise<FirstPartyPublicationReceipt> {
      const { accessToken, userId } = validatePrepared(prepared, config);
      const fetchImpl = config.fetchImpl ?? fetch;
      const headers = { Authorization: `Bearer ${accessToken}` };
      const signalTimeout = timeout(config.timeoutMs);

      // Check user-context binding before any potentially billable/write operation.
      let identityResponse: Response;
      try {
        identityResponse = await fetchImpl(X_ME_ENDPOINT, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(signalTimeout),
        });
      } catch {
        throw new XFirstPartyAdapterError({
          code: 'X_IDENTITY_UNAVAILABLE',
          truthState: 'FAILED',
          evidence: { phase: 'identity' },
        });
      }
      if (!identityResponse.ok) {
        throw new XFirstPartyAdapterError({
          code: 'X_IDENTITY_NOT_VERIFIED',
          truthState: 'FAILED',
          evidence: { phase: 'identity', httpStatus: identityResponse.status },
        });
      }
      const identity = dataFrom(await fetchJson(identityResponse));
      if (text(identity.id) !== userId) {
        throw new XFirstPartyAdapterError({
          code: 'X_AUTHENTICATED_ACCOUNT_MISMATCH',
          truthState: 'FAILED',
          evidence: { phase: 'identity', httpStatus: identityResponse.status },
        });
      }

      let writeResponse: Response;
      try {
        writeResponse = await fetchImpl(X_POSTS_ENDPOINT, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: prepared.text }),
          signal: AbortSignal.timeout(signalTimeout),
        });
      } catch {
        throw new XFirstPartyAdapterError({
          code: 'X_WRITE_OUTCOME_UNKNOWN',
          truthState: 'UNKNOWN',
          evidence: { phase: 'write' },
        });
      }
      if (writeResponse.status >= 500) {
        throw new XFirstPartyAdapterError({
          code: 'X_WRITE_SERVER_OUTCOME_UNKNOWN',
          truthState: 'UNKNOWN',
          evidence: { phase: 'write', httpStatus: writeResponse.status },
        });
      }
      if (writeResponse.status !== 201) {
        throw new XFirstPartyAdapterError({
          code: 'X_WRITE_REJECTED',
          truthState: 'FAILED',
          evidence: { phase: 'write', httpStatus: writeResponse.status },
        });
      }

      const written = dataFrom(await fetchJson(writeResponse));
      const postId = text(written.id);
      if (!X_POST_ID.test(postId) || text(written.text) !== prepared.text) {
        throw new XFirstPartyAdapterError({
          code: 'X_WRITE_RECEIPT_UNVERIFIED',
          truthState: 'UNKNOWN',
          evidence: { phase: 'write-receipt', httpStatus: 201 },
        });
      }

      // Provider readback is required before declaring success. An accepted write
      // cannot be retried when its readback is unavailable or mismatched.
      const postPermalink = permalink(postId);
      const readbackUrl = `${X_POSTS_ENDPOINT}/${postId}?tweet.fields=author_id,created_at`;
      let readbackResponse: Response;
      try {
        readbackResponse = await fetchImpl(readbackUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(signalTimeout),
        });
      } catch {
        throw new XFirstPartyAdapterError({
          code: 'X_READBACK_UNAVAILABLE',
          truthState: 'UNKNOWN',
          evidence: { phase: 'readback', postId, permalink: postPermalink },
        });
      }
      if (!readbackResponse.ok) {
        throw new XFirstPartyAdapterError({
          code: 'X_READBACK_NOT_VERIFIED',
          truthState: 'UNKNOWN',
          evidence: { phase: 'readback', postId, permalink: postPermalink, httpStatus: readbackResponse.status },
        });
      }
      const readback = dataFrom(await fetchJson(readbackResponse));
      const publishedAt = text(readback.created_at);
      const parsedDate = Date.parse(publishedAt);
      if (
        text(readback.id) !== postId ||
        text(readback.text) !== prepared.text ||
        text(readback.author_id) !== userId ||
        !publishedAt ||
        !Number.isFinite(parsedDate)
      ) {
        throw new XFirstPartyAdapterError({
          code: 'X_READBACK_MISMATCH',
          truthState: 'UNKNOWN',
          evidence: { phase: 'readback-verify', postId, permalink: postPermalink, httpStatus: readbackResponse.status },
        });
      }
      return {
        platform: 'x',
        externalPostId: postId,
        permalink: postPermalink,
        providerRequestId: text(writeResponse.headers.get('x-request-id')) || null,
        publishedAt: new Date(parsedDate).toISOString(),
        contentHash: prepared.contentHash,
        sourceCommitSha: prepared.sourceCommitSha,
        proofUrls: prepared.proofUrls,
      };
    },
  };
}
