import type {
  FirstPartyPlatformAdapter,
  FirstPartyPublicationReceipt,
  PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';

export const LINKEDIN_POSTS_ENDPOINT = 'https://api.linkedin.com/rest/posts' as const;
export const DEFAULT_LINKEDIN_API_VERSION = '202607' as const;

const LINKEDIN_AUTHOR_URN = /^urn:li:(person|organization):[A-Za-z0-9_-]+$/;
const LINKEDIN_POST_URN = /^urn:li:(share|ugcPost):[A-Za-z0-9_-]+$/;
const LINKEDIN_VERSION = /^20\d{4}$/;

export type LinkedInPublicationTruthState = 'FAILED' | 'UNKNOWN';

export interface LinkedInFirstPartyAdapterConfig {
  accessToken: string;
  authorUrn: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface LinkedInPublicationUnknownEvidence {
  postUrn: string | null;
  permalink: string | null;
  httpStatus: number | null;
  phase: 'write' | 'write-receipt' | 'readback' | 'readback-verify';
}

export class LinkedInFirstPartyAdapterError extends Error {
  readonly code: string;
  readonly truthState: LinkedInPublicationTruthState;
  readonly retrySafe: boolean;
  readonly evidence: LinkedInPublicationUnknownEvidence;

  constructor(options: {
    code: string;
    truthState: LinkedInPublicationTruthState;
    retrySafe: boolean;
    evidence?: Partial<LinkedInPublicationUnknownEvidence>;
  }) {
    super(options.code);
    this.name = 'LinkedInFirstPartyAdapterError';
    this.code = options.code;
    this.truthState = options.truthState;
    this.retrySafe = options.retrySafe;
    this.evidence = {
      postUrn: options.evidence?.postUrn ?? null,
      permalink: options.evidence?.permalink ?? null,
      httpStatus: options.evidence?.httpStatus ?? null,
      phase: options.evidence?.phase ?? 'write',
    };
  }
}

interface LinkedInPostReadback {
  id?: unknown;
  author?: unknown;
  commentary?: unknown;
  lifecycleState?: unknown;
  visibility?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeTimeout(value: number | undefined): number {
  if (!Number.isFinite(value) || Number(value) < 1_000 || Number(value) > 30_000) return 10_000;
  return Math.trunc(Number(value));
}

function permalinkFor(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}/`;
}

function validatePrepared(prepared: PreparedFirstPartyPublication, config: LinkedInFirstPartyAdapterConfig) {
  const accessToken = text(config.accessToken);
  const authorUrn = text(config.authorUrn);
  const apiVersion = text(config.apiVersion) || DEFAULT_LINKEDIN_API_VERSION;
  const errors: string[] = [];

  if (prepared.platform !== 'linkedin') errors.push('LINKEDIN_ADAPTER_PLATFORM_MISMATCH');
  if (prepared.mode !== 'publish') errors.push('LINKEDIN_ADAPTER_REQUIRES_PUBLISH_MODE');
  if (!accessToken) errors.push('LINKEDIN_ACCESS_TOKEN_NOT_CONFIGURED');
  if (!LINKEDIN_AUTHOR_URN.test(authorUrn)) errors.push('LINKEDIN_AUTHOR_URN_INVALID');
  if (prepared.accountId !== authorUrn) errors.push('LINKEDIN_ACCOUNT_AUTHORITY_MISMATCH');
  if (!LINKEDIN_VERSION.test(apiVersion)) errors.push('LINKEDIN_API_VERSION_INVALID');
  if (prepared.media.length > 0) errors.push('LINKEDIN_TEXT_ONLY_ADAPTER_REJECTS_MEDIA');

  if (errors.length > 0) {
    throw new LinkedInFirstPartyAdapterError({
      code: errors.join(';'),
      truthState: 'FAILED',
      retrySafe: true,
      evidence: { phase: 'write' },
    });
  }

  return { accessToken, authorUrn, apiVersion };
}

function requestHeaders(accessToken: string, apiVersion: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Linkedin-Version': apiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

function publishedAtIso(readback: LinkedInPostReadback): string | null {
  const raw = readback.publishedAt ?? readback.createdAt;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  const value = new Date(raw).toISOString();
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function verifyReadback(
  readback: LinkedInPostReadback,
  prepared: PreparedFirstPartyPublication,
  authorUrn: string,
  postUrn: string,
): string[] {
  const reasons: string[] = [];
  if (text(readback.id) !== postUrn) reasons.push('LINKEDIN_READBACK_POST_ID_MISMATCH');
  if (text(readback.author) !== authorUrn) reasons.push('LINKEDIN_READBACK_AUTHOR_MISMATCH');
  if (text(readback.commentary) !== prepared.text) reasons.push('LINKEDIN_READBACK_COPY_MISMATCH');
  if (text(readback.lifecycleState).toUpperCase() !== 'PUBLISHED') reasons.push('LINKEDIN_READBACK_NOT_PUBLISHED');
  if (text(readback.visibility).toUpperCase() !== 'PUBLIC') reasons.push('LINKEDIN_READBACK_NOT_PUBLIC');
  if (!publishedAtIso(readback)) reasons.push('LINKEDIN_READBACK_PUBLISHED_AT_MISSING');
  return reasons;
}

export function createLinkedInFirstPartyAdapter(
  config: LinkedInFirstPartyAdapterConfig,
): FirstPartyPlatformAdapter {
  return {
    platform: 'linkedin',
    async publish(prepared: PreparedFirstPartyPublication): Promise<FirstPartyPublicationReceipt> {
      const validated = validatePrepared(prepared, config);
      const fetchImpl = config.fetchImpl ?? fetch;
      const timeoutMs = safeTimeout(config.timeoutMs);
      const headers = requestHeaders(validated.accessToken, validated.apiVersion);
      const requestBody = {
        author: validated.authorUrn,
        commentary: prepared.text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };

      let writeResponse: Response;
      try {
        writeResponse = await fetchImpl(LINKEDIN_POSTS_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_WRITE_OUTCOME_UNKNOWN',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'write' },
        });
      }

      if (writeResponse.status >= 500) {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_WRITE_SERVER_OUTCOME_UNKNOWN',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'write', httpStatus: writeResponse.status },
        });
      }
      if (writeResponse.status !== 201) {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_WRITE_REJECTED',
          truthState: 'FAILED',
          retrySafe: true,
          evidence: { phase: 'write', httpStatus: writeResponse.status },
        });
      }

      const postUrn = text(writeResponse.headers.get('x-restli-id'));
      if (!LINKEDIN_POST_URN.test(postUrn)) {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_WRITE_ACCEPTED_WITHOUT_POST_ID',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'write-receipt', httpStatus: 201 },
        });
      }
      const permalink = permalinkFor(postUrn);
      const requestId =
        text(writeResponse.headers.get('x-restli-request-id')) ||
        text(writeResponse.headers.get('x-li-uuid')) ||
        null;

      let readbackResponse: Response;
      try {
        const encodedPostUrn = encodeURIComponent(postUrn);
        readbackResponse = await fetchImpl(
          `${LINKEDIN_POSTS_ENDPOINT}/${encodedPostUrn}?viewContext=AUTHOR`,
          {
            method: 'GET',
            headers: {
              Authorization: headers.Authorization,
              'Linkedin-Version': validated.apiVersion,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      } catch {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_READBACK_UNAVAILABLE',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'readback', postUrn, permalink },
        });
      }

      if (!readbackResponse.ok) {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_READBACK_NOT_VERIFIED',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: {
            phase: 'readback',
            postUrn,
            permalink,
            httpStatus: readbackResponse.status,
          },
        });
      }

      let readback: LinkedInPostReadback;
      try {
        readback = (await readbackResponse.json()) as LinkedInPostReadback;
      } catch {
        throw new LinkedInFirstPartyAdapterError({
          code: 'LINKEDIN_READBACK_INVALID_JSON',
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'readback', postUrn, permalink, httpStatus: readbackResponse.status },
        });
      }

      const readbackErrors = verifyReadback(readback, prepared, validated.authorUrn, postUrn);
      if (readbackErrors.length > 0) {
        throw new LinkedInFirstPartyAdapterError({
          code: readbackErrors.join(';'),
          truthState: 'UNKNOWN',
          retrySafe: false,
          evidence: { phase: 'readback-verify', postUrn, permalink, httpStatus: readbackResponse.status },
        });
      }

      return {
        platform: 'linkedin',
        externalPostId: postUrn,
        permalink,
        providerRequestId: requestId,
        publishedAt: publishedAtIso(readback)!,
        contentHash: prepared.contentHash,
        sourceCommitSha: prepared.sourceCommitSha,
        proofUrls: prepared.proofUrls,
      };
    },
  };
}
