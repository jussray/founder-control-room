export const EXECUTION_PATH = '/v1/synthetic-evidence';
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
export const MIN_SHARED_SECRET_LENGTH = 32;

const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,95}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,95}$/;
const HEX_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN = /^\d{13}$/;
const encoder = new TextEncoder();

function failure(code) {
  return { ok: false, code };
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(first, second) {
  if (first.length !== second.length) return false;

  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

function parseTimestamp(rawTimestamp) {
  if (!TIMESTAMP_PATTERN.test(rawTimestamp ?? '')) return null;
  const parsed = Number(rawTimestamp);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function canonicalInvocation(invocation) {
  return [
    'fcr-ai-company-sandbox/v1',
    invocation.method,
    invocation.pathname,
    invocation.subject,
    String(invocation.issuedAt),
    invocation.nonce,
  ].join('\n');
}

export async function signInvocation(secret, invocation) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(canonicalInvocation(invocation)),
  );
  return toHex(new Uint8Array(signature));
}

export async function deriveSandboxSessionId(invocation) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonicalInvocation(invocation)),
  );
  return `session-${toHex(new Uint8Array(digest)).slice(0, 48)}`;
}

export async function deriveSubjectGateId(subject) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`gate:${subject}`));
  return `gate-${toHex(new Uint8Array(digest)).slice(0, 48)}`;
}

export async function authenticateInvocation(request, secret, now = Date.now()) {
  if (!secret || secret.length < MIN_SHARED_SECRET_LENGTH) {
    return failure('sandbox_unconfigured');
  }

  const url = new URL(request.url);
  if (request.method !== 'POST') return failure('method_not_allowed');
  if (url.pathname !== EXECUTION_PATH || url.search) return failure('route_not_found');

  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) !== 0)) {
    return failure('body_not_allowed');
  }
  if (request.body !== null) return failure('body_not_allowed');

  const subject = request.headers.get('x-sandbox-subject');
  const nonce = request.headers.get('x-sandbox-nonce');
  const issuedAt = parseTimestamp(request.headers.get('x-sandbox-issued-at'));
  const suppliedSignature = request.headers.get('x-sandbox-signature');

  if (!SUBJECT_PATTERN.test(subject ?? '')) return failure('invalid_subject');
  if (!NONCE_PATTERN.test(nonce ?? '')) return failure('invalid_nonce');
  if (issuedAt === null) return failure('invalid_timestamp');
  if (!HEX_SIGNATURE_PATTERN.test(suppliedSignature ?? '')) return failure('invalid_signature');
  if (issuedAt < now - MAX_CLOCK_SKEW_MS) return failure('stale_request');
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) return failure('future_request');

  const invocation = {
    method: request.method,
    pathname: url.pathname,
    subject,
    nonce,
    issuedAt,
  };
  const expectedSignature = await signInvocation(secret, invocation);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    return failure('invalid_signature');
  }

  return { ok: true, invocation };
}
