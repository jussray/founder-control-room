import type {
  FirstPartyPlatformAdapter,
  FirstPartyPublicationReceipt,
  PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';

export const X_CURRENT_USER_ENDPOINT = 'https://api.x.com/2/users/me' as const;
export const X_CREATE_POST_ENDPOINT = 'https://api.x.com/2/tweets' as const;
const NUMERIC_ID = /^[0-9]{1,24}$/;
const SHA = /^[0-9a-f]{40}$/i;
const DIGEST = /^[0-9a-f]{64}$/i;

export interface XFirstPartyAdapterConfig {
  accessToken: string;
  userId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class XFirstPartyAdapterError extends Error {
  readonly code: string;
  readonly truthState: 'FAILED' | 'UNKNOWN';
  readonly retrySafe = false;
  readonly evidence: {
    phase: 'validate' | 'identity' | 'write' | 'write-receipt' | 'readback' | 'readback-verify';
    postId: string | null;
    permalink: string | null;
    httpStatus: number | null;
  };
  constructor(
    code: string,
    truthState: 'FAILED' | 'UNKNOWN',
    phase: XFirstPartyAdapterError['evidence']['phase'],
    postId: string | null = null,
    httpStatus: number | null = null,
  ) {
    super(code); // Never include tokens, HTTP body, or provider-supplied error text.
    this.name = 'XFirstPartyAdapterError';
    this.code = code;
    this.truthState = truthState;
    this.evidence = {
      phase,
      postId,
      permalink: postId ? `https://x.com/i/web/status/${postId}` : null,
      httpStatus,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function timeout(ms: number | undefined): number {
  return Number.isInteger(ms) && ms! >= 1000 && ms! <= 30000 ? ms! : 10000;
}

function validatePrepared(
  prepared: PreparedFirstPartyPublication,
  config: XFirstPartyAdapterConfig,
): void {
  if (
    prepared.platform !== 'x' || prepared.mode !== 'publish' ||
    !NUMERIC_ID.test(config.userId) || prepared.accountId !== config.userId ||
    !config.accessToken?.trim() || !prepared.founderApprovalId?.trim() ||
    !DIGEST.test(prepared.contentHash) || !DIGEST.test(prepared.idempotencyKey) ||
    !SHA.test(prepared.sourceCommitSha) ||
    !prepared.text?.trim() || prepared.text.length > 270 ||
    prepared.media?.length !== 0
  ) {
    throw new XFirstPartyAdapterError('X_PUBLICATION_INPUT_REJECTED', 'FAILED', 'validate');
  }
}

async function jsonData(response: Response): Promise<Record<string, unknown>> {
  return asRecord(asRecord(await response.json()).data);
}

export function createXFirstPartyAdapter(config: XFirstPartyAdapterConfig): FirstPartyPlatformAdapter {
  return {
    platform: 'x',
    async publish(prepared): Promise<FirstPartyPublicationReceipt> {
      validatePrepared(prepared, config);
      const fetchImpl = config.fetchImpl ?? fetch;
      const headers = { Authorization: `Bearer ${config.accessToken}` };
      const ms = timeout(config.timeoutMs);

      // The server-held target ID is authoritative. A token for another account must never publish.
      let identity: Response;
      try {
        identity = await fetchImpl(X_CURRENT_USER_ENDPOINT, {
          method: 'GET', headers, signal: AbortSignal.timeout(ms),
        });
      } catch {
        throw new XFirstPartyAdapterError('X_IDENTITY_UNAVAILABLE', 'FAILED', 'identity');
      }
      if (!identity.ok) {
        throw new XFirstPartyAdapterError('X_IDENTITY_REJECTED', 'FAILED', 'identity', null, identity.status);
      }
      let current: Record<string, unknown>;
      try {
        current = await jsonData(identity);
      } catch {
        throw new XFirstPartyAdapterError('X_IDENTITY_INVALID', 'FAILED', 'identity');
      }
      if (current.id !== config.userId) {
        throw new XFirstPartyAdapterError('X_ACCOUNT_ID_MISMATCH', 'FAILED', 'identity');
      }

      let created: Response;
      try {
        created = await fetchImpl(X_CREATE_POST_ENDPOINT, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: prepared.text }),
          signal: AbortSignal.timeout(ms),
        });
      } catch {
        throw new XFirstPartyAdapterError('X_WRITE_OUTCOME_UNKNOWN', 'UNKNOWN', 'write');
      }
      if (created.status >= 500) {
        throw new XFirstPartyAdapterError('X_WRITE_SERVER_OUTCOME_UNKNOWN', 'UNKNOWN', 'write', null, created.status);
      }
      if (created.status !== 201) {
        throw new XFirstPartyAdapterError('X_WRITE_REJECTED', 'FAILED', 'write', null, created.status);
      }
      let written: Record<string, unknown>;
      try {
        written = await jsonData(created);
      } catch {
        throw new XFirstPartyAdapterError('X_WRITE_RECEIPT_INVALID', 'UNKNOWN', 'write-receipt', null, created.status);
      }
      const postId = typeof written.id === 'string' ? written.id : '';
      if (!NUMERIC_ID.test(postId) || written.text !== prepared.text) {
        throw new XFirstPartyAdapterError('X_WRITE_RECEIPT_MISMATCH', 'UNKNOWN', 'write-receipt', NUMERIC_ID.test(postId) ? postId : null, created.status);
      }

      // A successful write is NOT published proof until independent provider readback matches.
      let readback: Response;
      try {
        readback = await fetchImpl(
          `${X_CREATE_POST_ENDPOINT}/${postId}?tweet.fields=author_id%2Ccreated_at`,
          { method: 'GET', headers, signal: AbortSignal.timeout(ms) },
        );
      } catch {
        throw new XFirstPartyAdapterError('X_READBACK_UNAVAILABLE', 'UNKNOWN', 'readback', postId);
      }
      if (!readback.ok) {
        throw new XFirstPartyAdapterError('X_READBACK_REJECTED', 'UNKNOWN', 'readback', postId, readback.status);
      }
      let observed: Record<string, unknown>;
      try {
        observed = await jsonData(readback);
      } catch {
        throw new XFirstPartyAdapterError('X_READBACK_INVALID', 'UNKNOWN', 'readback', postId, readback.status);
      }
      const createdAt = typeof observed.created_at === 'string' ? observed.created_at : '';
      if (
        observed.id !== postId || observed.author_id !== config.userId ||
        observed.text !== prepared.text || !createdAt ||
        !Number.isFinite(Date.parse(createdAt))
      ) {
        throw new XFirstPartyAdapterError('X_READBACK_MISMATCH', 'UNKNOWN', 'readback-verify', postId, readback.status);
      }
      return {
        platform: 'x',
        externalPostId: postId,
        permalink: `https://x.com/i/web/status/${postId}`,
        providerRequestId: readback.headers.get('x-request-id') || created.headers.get('x-request-id'),
        publishedAt: new Date(createdAt).toISOString(),
        contentHash: prepared.contentHash,
        sourceCommitSha: prepared.sourceCommitSha,
        proofUrls: prepared.proofUrls,
      };
    },
  };
}
