import { supabase } from '../lib/supabaseClient.js';
import { sendWebPush, unsealSubscription, vapidPublicKey } from './webPushTransport.js';

export function notificationOwnerId(env = process.env): string | null {
  const value = env.FCR_WEB_PUSH_FOUNDER_USER_ID ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
}

export function founderPushConfig(env = process.env) {
  if (env.FCR_WEB_PUSH_ENABLED !== 'true') return null;
  const privateKey = env.FCR_WEB_PUSH_VAPID_PRIVATE_KEY ?? '';
  const storageKey = env.FCR_WEB_PUSH_STORAGE_KEY ?? '';
  const subject = env.FCR_WEB_PUSH_SUBJECT ?? '';
  const ownerId = notificationOwnerId(env);
  if (!ownerId) throw new Error('push_owner_unconfigured');
  const publicKey = vapidPublicKey(privateKey);
  if (Buffer.from(storageKey, 'base64url').length !== 32 || Buffer.from(storageKey, 'base64url').toString('base64url') !== storageKey || !(/^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s]+$/.test(subject))) throw new Error('push_config_invalid');
  return { privateKey, storageKey, subject, publicKey, ownerId };
}

type Config = NonNullable<ReturnType<typeof founderPushConfig>>;
type Claim = { delivery_id: string; subscription_id: string; user_id: string; encrypted_subscription: string; claim_token: string; attempt_count: number; metadata: unknown };
const titles: Record<string, string> = {
  workflow_passed: 'Workflow passed',
  workflow_recovered: 'Workflow recovered',
  pull_request_merged: 'Pull request merged',
  deployment_succeeded: 'Deployment succeeded',
};

export function notificationPushPayload(metadata: unknown, deliveryId: string) {
  const value = metadata as { contract?: string; intent?: { kind?: string } } | null;
  const kind = value?.intent?.kind;
  if (value?.contract !== 'fcr/founder-notification@v1' || !kind || !Object.hasOwn(titles, kind)) throw new Error('unknown_notification_intent');
  // Lock-screen content is deliberately generic. Repository and evidence are
  // available after founder sign-in, not in the push provider payload.
  return { title: 'FCR · ' + titles[kind], body: 'Open Founder Control Room for evidence.', tag: deliveryId, url: '/control-room/notifications' };
}

export function deliveryOutcome(status: number | null, attempts: number) {
  if (status !== null && status >= 200 && status < 300) return 'provider_accepted' as const;
  const retryable = status === null || status === 429 || (status >= 500 && status <= 599);
  if (retryable) return attempts < 3 ? 'retry' as const : 'unknown' as const;
  return 'failed' as const;
}

async function finishClaim(claim: Claim, state: ReturnType<typeof deliveryOutcome>, status: number | null) {
  const { data, error } = await supabase.from('founder_notification_deliveries').update({
    state, provider_status: status,
    provider_accepted_at: state === 'provider_accepted' ? new Date().toISOString() : null,
    next_attempt_at: new Date(Date.now() + 60_000 * (2 ** claim.attempt_count)).toISOString(),
    lease_until: null, claim_token: null,
  }).eq('id', claim.delivery_id).eq('claim_token', claim.claim_token).eq('state', 'sending').select('id').maybeSingle();
  if (error || !data) throw new Error('notification_claim_completion_failed');
}

async function dispatch(claim: Claim, config: Config) {
  const { data: subscription, error } = await supabase.from('founder_notification_subscriptions')
    .select('id,user_id,encrypted_subscription,revoked_at').eq('id', claim.subscription_id).maybeSingle();
  if (error) throw new Error('subscription_recheck_failed');
  const { data: founder, error: founderError } = await supabase.from('founder_users').select('user_id').eq('user_id', claim.user_id).maybeSingle();
  if (founderError) throw new Error('founder_recheck_failed');
  if (claim.user_id !== config.ownerId || !founder || !subscription || subscription.revoked_at || subscription.user_id !== claim.user_id ||
      subscription.encrypted_subscription !== claim.encrypted_subscription) {
    await finishClaim(claim, 'failed', null);
    return;
  }
  let payload, device;
  try {
    payload = notificationPushPayload(claim.metadata, claim.delivery_id);
    device = unsealSubscription(claim.encrypted_subscription, config.storageKey, claim.user_id);
  } catch {
    await finishClaim(claim, 'failed', null);
    return;
  }
  let status: number | null = null;
  try {
    status = await sendWebPush(device, payload, config.privateKey, config.subject, claim.delivery_id);
  } catch { /* A network failure cannot prove acceptance or non-delivery. */ }
  if (status === 404 || status === 410) {
    const { error: revokeError } = await supabase.from('founder_notification_subscriptions').update({ revoked_at: new Date().toISOString() })
      .eq('id', claim.subscription_id).eq('encrypted_subscription', claim.encrypted_subscription).is('revoked_at', null);
    if (revokeError) throw new Error('expired_subscription_revoke_failed');
  }
  await finishClaim(claim, deliveryOutcome(status, claim.attempt_count), status);
}

export async function runFounderNotificationDeliveryCycle() {
  const config = founderPushConfig();
  if (!config) return { state: 'disabled', claimed: 0 };
  const { data, error } = await supabase.rpc('claim_founder_notification_deliveries', { owner_user_id: config.ownerId, batch_limit: 20 });
  if (error) throw new Error('notification_claim_failed');
  const claims = (data ?? []) as Claim[];
  let failed = 0;
  for (let offset = 0; offset < claims.length; offset += 4) {
    const results = await Promise.allSettled(claims.slice(offset, offset + 4).map(claim => dispatch(claim, config)));
    failed += results.filter(result => result.status === 'rejected').length;
  }
  if (failed) throw new Error('notification_delivery_cycle_incomplete');
  return { state: 'processed', claimed: claims.length };
}
