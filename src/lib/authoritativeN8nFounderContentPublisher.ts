import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  dispatchAuthoritativeN8nFounderContent as dispatchAuthoritativeN8nFounderContentBase,
  type AuthoritativeN8nFounderContentInput,
  type AuthoritativeN8nFounderContentOptions,
  type AuthoritativeN8nFounderContentResult,
} from './n8nFounderContentAuthorityAdapter.js';
import { N8N_FOUNDER_CONTENT_CONTRACT } from './n8nFounderContentOrchestrator.js';

export * from './n8nFounderContentAuthorityAdapter.js';

export const N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT =
  'fcr/n8n-founder-content-runtime-identity@v1' as const;

const SHA256 = /^[0-9a-f]{64}$/i;
const WORKFLOW_ID = /^[A-Za-z0-9._:-]{3,160}$/;
const RUNTIME_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const MIN_IDENTITY_SECRET_LENGTH = 32;

export interface N8nFounderContentRuntimeIdentityExpectation {
  workflowId: string;
  workflowFingerprint: string;
  runtimeVersion: string;
}

export interface N8nFounderContentRuntimeIdentityVerification {
  ok: boolean;
  reason: string | null;
}

interface RuntimeIdentityConfig {
  expectation: N8nFounderContentRuntimeIdentityExpectation;
  hmacSecret: string;
  reasons: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function identityMessage(
  expectation: N8nFounderContentRuntimeIdentityExpectation,
  challenge: string,
): string {
  return [
    N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT,
    challenge,
    expectation.workflowId,
    expectation.workflowFingerprint,
    expectation.runtimeVersion,
    N8N_FOUNDER_CONTENT_CONTRACT,
  ].join('\n');
}

export function computeN8nFounderContentRuntimeIdentitySignature(
  expectation: N8nFounderContentRuntimeIdentityExpectation,
  challenge: string,
  hmacSecret: string,
): string {
  return createHmac('sha256', hmacSecret)
    .update(identityMessage(expectation, challenge))
    .digest('hex');
}

function readRuntimeIdentityConfig(env: NodeJS.ProcessEnv): RuntimeIdentityConfig {
  const expectation = {
    workflowId: text(env.N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_ID),
    workflowFingerprint: text(env.N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT).toLowerCase(),
    runtimeVersion: text(env.N8N_FOUNDER_CONTENT_EXPECTED_RUNTIME_VERSION),
  };
  const hmacSecret = text(env.N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET);
  const reasons: string[] = [];

  if (!WORKFLOW_ID.test(expectation.workflowId)) {
    reasons.push('N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_ID must name one exact workflow identity');
  }
  if (!SHA256.test(expectation.workflowFingerprint)) {
    reasons.push('N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT must be one exact SHA-256 fingerprint');
  }
  if (!RUNTIME_VERSION.test(expectation.runtimeVersion)) {
    reasons.push('N8N_FOUNDER_CONTENT_EXPECTED_RUNTIME_VERSION must be one exact semantic runtime version');
  }
  if (hmacSecret.length < MIN_IDENTITY_SECRET_LENGTH) {
    reasons.push('N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET must contain at least 32 characters');
  }

  return { expectation, hmacSecret, reasons };
}

function signaturesMatch(expected: string, supplied: string): boolean {
  if (!SHA256.test(expected) || !SHA256.test(supplied)) return false;
  const expectedBytes = Buffer.from(expected, 'hex');
  const suppliedBytes = Buffer.from(supplied, 'hex');
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function verifyN8nFounderContentRuntimeIdentityHeaders(
  headers: Headers,
  challenge: string,
  expectation: N8nFounderContentRuntimeIdentityExpectation,
  hmacSecret: string,
): N8nFounderContentRuntimeIdentityVerification {
  const responseChallenge = text(headers.get('x-fcr-n8n-identity-challenge'));
  const responseContract = text(headers.get('x-fcr-n8n-identity-contract'));
  const workflowId = text(headers.get('x-fcr-n8n-workflow-id'));
  const workflowFingerprint = text(headers.get('x-fcr-n8n-workflow-fingerprint')).toLowerCase();
  const runtimeVersion = text(headers.get('x-fcr-n8n-runtime-version'));
  const signature = text(headers.get('x-fcr-n8n-identity-signature')).toLowerCase();

  if (!challenge || responseChallenge !== challenge) {
    return { ok: false, reason: 'n8n runtime identity challenge did not match the exact FCR request' };
  }
  if (responseContract !== N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT) {
    return { ok: false, reason: 'n8n runtime identity contract is missing or unsupported' };
  }
  if (workflowId !== expectation.workflowId) {
    return { ok: false, reason: 'n8n runtime workflow id does not match the configured exact workflow' };
  }
  if (workflowFingerprint !== expectation.workflowFingerprint) {
    return { ok: false, reason: 'n8n runtime workflow fingerprint does not match the configured exact workflow' };
  }
  if (runtimeVersion !== expectation.runtimeVersion) {
    return { ok: false, reason: 'n8n runtime version does not match the configured exact runtime' };
  }

  const expectedSignature = computeN8nFounderContentRuntimeIdentitySignature(
    expectation,
    challenge,
    hmacSecret,
  );
  if (!signaturesMatch(expectedSignature, signature)) {
    return { ok: false, reason: 'n8n runtime identity signature is missing or invalid' };
  }

  return { ok: true, reason: null };
}

export function createN8nFounderContentRuntimeIdentityFetch(
  fetchImpl: typeof fetch,
  expectation: N8nFounderContentRuntimeIdentityExpectation,
  hmacSecret: string,
  onIdentityFailure: (reason: string) => void,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const challenge = randomBytes(32).toString('hex');
    const headers = new Headers(init?.headers);
    headers.set('X-FCR-N8N-Identity-Challenge', challenge);
    headers.set('X-FCR-N8N-Identity-Contract', N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT);
    headers.set('X-FCR-N8N-Expected-Workflow-Id', expectation.workflowId);
    headers.set('X-FCR-N8N-Expected-Workflow-Fingerprint', expectation.workflowFingerprint);
    headers.set('X-FCR-N8N-Expected-Runtime-Version', expectation.runtimeVersion);

    const response = await fetchImpl(input, { ...init, headers });
    if (!response.ok) return response;

    const verification = verifyN8nFounderContentRuntimeIdentityHeaders(
      response.headers,
      challenge,
      expectation,
      hmacSecret,
    );
    if (verification.ok) return response;

    const reason = verification.reason ?? 'n8n runtime identity proof failed';
    onIdentityFailure(reason);

    let body: Record<string, unknown> = {};
    try {
      const parsed = await response.clone().json() as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }

    return new Response(JSON.stringify({
      ...body,
      orchestrationId: 'fcr-n8n-runtime-identity-rejected',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

/**
 * Authoritative founder-content publishing facade.
 *
 * The underlying adapter still owns approval, cadence, generation fencing, and
 * provider-write authority. This facade adds a terminal runtime identity membrane:
 * when the n8n lane is enabled, FCR requires an explicitly pinned workflow id,
 * workflow SHA-256 fingerprint, exact n8n runtime version, and a challenge-bound
 * HMAC response before the n8n receipt may finalize the execution ledger.
 * Missing or mismatched runtime identity never becomes publication truth.
 */
export async function dispatchAuthoritativeN8nFounderContent(
  input: AuthoritativeN8nFounderContentInput,
  options: AuthoritativeN8nFounderContentOptions,
): Promise<AuthoritativeN8nFounderContentResult> {
  const env = options.env ?? process.env;
  const enabled = text(env.N8N_FOUNDER_CONTENT_ENABLED).toLowerCase() === 'true';
  const runtimeIdentity = readRuntimeIdentityConfig(env);

  if (enabled && runtimeIdentity.reasons.length > 0) {
    return {
      ok: false,
      code: 'ORCHESTRATION_NOT_CONFIGURED',
      status: 503,
      request: null,
      receipt: null,
      reasons: [
        ...runtimeIdentity.reasons,
        'FCR did not consume one-shot founder authority because n8n runtime identity proof is not fully configured',
      ],
    };
  }

  if (!enabled) {
    return dispatchAuthoritativeN8nFounderContentBase(input, options);
  }

  let identityFailure: string | null = null;
  const identityFetch = createN8nFounderContentRuntimeIdentityFetch(
    options.fetchImpl ?? fetch,
    runtimeIdentity.expectation,
    runtimeIdentity.hmacSecret,
    (reason) => {
      identityFailure = reason;
    },
  );

  const result = await dispatchAuthoritativeN8nFounderContentBase(input, {
    ...options,
    env,
    fetchImpl: identityFetch,
  });

  if (!identityFailure) return result;

  return {
    ok: false,
    code: 'UPSTREAM_RECEIPT_INVALID',
    status: 502,
    request: result.request ?? null,
    receipt: null,
    reasons: [
      identityFailure,
      'n8n may have accepted the provider request, but FCR did not finalize the execution because runtime identity proof failed',
      'reconcile provider state and the execution ledger before any retry',
    ],
  };
}
