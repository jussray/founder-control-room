import { createHmac } from 'node:crypto';
import { parseFounderSignalReviewEmail } from '../founderSignalEmailIngress/email.js';

const MAX_RAW_BYTES = 128 * 1024;
const MIN_INGRESS_SECRET_LENGTH = 32;
const APPROVED_INGEST_URL = 'https://api.foundercontrolroom.org/ingest/founder-review-email';

interface FounderSignalReviewEmailEnv {
  FOUNDER_REVIEW_FOUNDER_EMAIL?: string;
  FOUNDER_REVIEW_EMAIL_DOMAIN?: string;
  FOUNDER_REVIEW_EMAIL_INGRESS_SECRET?: string;
  FOUNDER_REVIEW_INGEST_URL?: string;
}

interface FounderSignalReviewEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
  setReject(reason: string): void;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

function requireEnv(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`missing_${name.toLowerCase()}`);
  return trimmed;
}

function requireStrongSecret(value: string | undefined, name: string): string {
  const secret = requireEnv(value, name);
  if (secret.length < MIN_INGRESS_SECRET_LENGTH) {
    throw new Error(`weak_${name.toLowerCase()}`);
  }
  return secret;
}

function signEnvelope(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
}

async function readBoundedRaw(
  stream: ReadableStream<Uint8Array>,
  declaredSize: number,
): Promise<Uint8Array> {
  if (!Number.isInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_RAW_BYTES) {
    throw new Error('raw_email_size_rejected');
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > declaredSize || total > MAX_RAW_BYTES) {
        throw new Error('raw_email_size_mismatch');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total !== declaredSize) {
    throw new Error('raw_email_size_mismatch');
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function handleFounderSignalReviewEmail(
  message: FounderSignalReviewEmailMessage,
  env: FounderSignalReviewEmailEnv,
  _ctx?: ExecutionContextLike,
): Promise<void> {
  const founderEmail = requireEnv(
    env.FOUNDER_REVIEW_FOUNDER_EMAIL,
    'FOUNDER_REVIEW_FOUNDER_EMAIL',
  );
  const reviewDomain = requireEnv(
    env.FOUNDER_REVIEW_EMAIL_DOMAIN,
    'FOUNDER_REVIEW_EMAIL_DOMAIN',
  );
  const secret = requireStrongSecret(
    env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET,
    'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
  );
  const ingestUrl = requireEnv(
    env.FOUNDER_REVIEW_INGEST_URL,
    'FOUNDER_REVIEW_INGEST_URL',
  );

  if (ingestUrl !== APPROVED_INGEST_URL) {
    throw new Error('unapproved_review_ingest_url');
  }

  let receipt;
  try {
    const raw = await readBoundedRaw(message.raw, message.rawSize);
    receipt = parseFounderSignalReviewEmail(
      { from: message.from, to: message.to, raw },
      { founderEmail, reviewDomain },
    );
  } catch {
    message.setReject('Review command rejected');
    return;
  }

  const body = JSON.stringify(receipt);
  const timestamp = String(Date.now());
  const signature = signEnvelope(timestamp, body, secret);
  const response = await fetch(ingestUrl, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).byteLength),
      'x-founder-review-timestamp': timestamp,
      'x-founder-review-signature': signature,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`review_ingest_failed_${response.status}`);
  }
}

export default {
  email: handleFounderSignalReviewEmail,
};
