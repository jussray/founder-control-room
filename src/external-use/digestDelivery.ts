import {
  sendFounderControlRoomEmail,
  type ProjectEmailBinding,
} from '../worker/projectEmail.js';

export const EXTERNAL_USE_DIGEST_RECIPIENT = 'sekretbip@gmail.com';
export const EXTERNAL_USE_EMAIL_OUTCOME_UNKNOWN =
  'external_use_email_outcome_unknown_manual_reconcile';

const DIGEST_FAILED_RETRY_MS = 10 * 60_000;
const DIGEST_STALE_RUNNING_MS = 20 * 60_000;

/**
 * A message may have been accepted even if the provider response or database
 * finalization fails. Such rows require founder reconciliation, not a resend.
 */
export function retryExternalUseDigest(
  status: string,
  errorCode: unknown,
): number | undefined {
  if (errorCode === EXTERNAL_USE_EMAIL_OUTCOME_UNKNOWN) return undefined;
  if (status === 'failed') return DIGEST_FAILED_RETRY_MS;
  if (status === 'running') return DIGEST_STALE_RUNNING_MS;
  return undefined;
}

/** Use the already configured, founder-scoped Cloudflare Send Email binding. */
export async function sendExternalUseDigest(
  binding: ProjectEmailBinding,
  input: { subject: string; html?: string; text?: string },
): Promise<string> {
  return sendFounderControlRoomEmail(binding, {
    to: EXTERNAL_USE_DIGEST_RECIPIENT,
    ...input,
  });
}
