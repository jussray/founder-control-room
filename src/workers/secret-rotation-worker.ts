/**
 * Secret Rotation Worker
 * Deployed as Cloudflare Cron Trigger (weekly, Wednesdays 02:00 UTC)
 * Enforces 90-day rotation lease on GitHub App tokens and other credentials.
 * Rotates tokens at 60-day mark, warns at 75-day mark.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SecretRotationEnv = Readonly<Record<string, string | undefined>>;

interface StoredSecret {
  id: string;
  service: string;
  secret_type: string;
  created_at: string;
  rotated_at: string | null;
  expires_at: string | null;
  rotation_status: 'active' | 'rotating' | 'rotated' | 'warning' | 'critical';
}

interface RotationEvent {
  secret_id: string;
  service: string;
  action: 'rotation_started' | 'rotation_completed' | 'warning_issued' | 'critical_alert';
  rotated_at: string;
  expires_at: string | null;
  days_remaining: number;
}

const ROTATION_LEASE_DAYS = 90;
const ROTATION_START_AGE_DAYS = 60;
const WARNING_AGE_DAYS = 75;
const CRITICAL_AGE_DAYS = 85;

const ROTATION_START_REMAINING_DAYS = ROTATION_LEASE_DAYS - ROTATION_START_AGE_DAYS;
const WARNING_REMAINING_DAYS = ROTATION_LEASE_DAYS - WARNING_AGE_DAYS;
const CRITICAL_REMAINING_DAYS = ROTATION_LEASE_DAYS - CRITICAL_AGE_DAYS;

export function requireBinding(env: SecretRotationEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error('Missing secret rotation worker binding: ' + name);
  }
  return value;
}

function normalizeFailure(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'unknown secret rotation failure');
}

export function daysUntilExpiry(createdAt: string, rotatedAt: string | null): number {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) {
    throw new Error('Invalid created_at timestamp for secret rotation');
  }

  let referenceMs = createdMs;
  if (rotatedAt !== null) {
    const rotatedMs = Date.parse(rotatedAt);
    if (!Number.isFinite(rotatedMs)) {
      throw new Error('Invalid rotated_at timestamp for secret rotation');
    }
    if (rotatedMs < createdMs) {
      throw new Error('rotated_at precedes created_at for secret rotation');
    }
    referenceMs = rotatedMs;
  }

  const nowMs = Date.now();
  if (createdMs > nowMs || referenceMs > nowMs) {
    throw new Error('Secret rotation timestamp is in the future');
  }

  const expiryMs = referenceMs + ROTATION_LEASE_DAYS * 24 * 60 * 60 * 1000;
  const diffMs = expiryMs - nowMs;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function createSupabaseAdmin(env: SecretRotationEnv): SupabaseClient {
  return createClient(
    requireBinding(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireBinding(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// IMPLANT 2: Schema health check — verify secrets table exists before processing
export async function verifySecretsTableExists(supabaseAdmin: SupabaseClient): Promise<void> {
  const { error } = await supabaseAdmin
    .from('secrets')
    .select('id')
    .limit(0);
  if (error) {
    throw new Error(`CRITICAL: secrets table is missing or inaccessible: ${error.message}`);
  }
}

export async function checkSecretRotationStatus(
  secret: StoredSecret,
  supabaseAdmin: SupabaseClient,
): Promise<RotationEvent | null> {
  const daysRemaining = daysUntilExpiry(secret.created_at, secret.rotated_at);
  const now = new Date().toISOString();

  if (daysRemaining > ROTATION_START_REMAINING_DAYS) {
    return null;
  }

  if (daysRemaining <= 0) {
    await supabaseAdmin
      .from('secrets_audit_log')
      .insert({
        secret_id: secret.id,
        event_type: 'rotation_critical',
        severity: 'critical',
        message: `Secret expired ${Math.abs(daysRemaining)} days ago`,
        created_at: now,
      });

    return {
      secret_id: secret.id,
      service: secret.service,
      action: 'critical_alert',
      rotated_at: now,
      expires_at: secret.expires_at,
      days_remaining: daysRemaining,
    };
  }

  if (daysRemaining <= CRITICAL_REMAINING_DAYS) {
    await supabaseAdmin
      .from('secrets_audit_log')
      .insert({
        secret_id: secret.id,
        event_type: 'rotation_critical',
        severity: 'critical',
        message: `Secret expiration critical: ${daysRemaining} days remaining`,
        created_at: now,
      });

    return {
      secret_id: secret.id,
      service: secret.service,
      action: 'critical_alert',
      rotated_at: now,
      expires_at: secret.expires_at,
      days_remaining: daysRemaining,
    };
  }

  if (daysRemaining <= WARNING_REMAINING_DAYS) {
    await supabaseAdmin
      .from('secrets_audit_log')
      .insert({
        secret_id: secret.id,
        event_type: 'rotation_warning',
        severity: 'warning',
        message: `Secret expiration warning: ${daysRemaining} days remaining`,
        created_at: now,
      });

    return {
      secret_id: secret.id,
      service: secret.service,
      action: 'warning_issued',
      rotated_at: now,
      expires_at: secret.expires_at,
      days_remaining: daysRemaining,
    };
  }

  if (daysRemaining <= ROTATION_START_REMAINING_DAYS) {
    const { error: statusUpdateError } = await supabaseAdmin
      .from('secrets')
      .update({ rotation_status: 'rotating' })
      .eq('id', secret.id);

    if (statusUpdateError) throw statusUpdateError;

    await supabaseAdmin
      .from('secrets_audit_log')
      .insert({
        secret_id: secret.id,
        event_type: 'rotation_initiated',
        severity: 'info',
        message: `Rotation initiated: ${daysRemaining} days remaining in lease`,
        created_at: now,
      });

    return {
      secret_id: secret.id,
      service: secret.service,
      action: 'rotation_started',
      rotated_at: now,
      expires_at: secret.expires_at,
      days_remaining: daysRemaining,
    };
  }

  return null;
}

export async function emitRotationEvent(
  event: RotationEvent,
  env: SecretRotationEnv,
): Promise<void> {
  const webhookUrl = env.INCIDENT_WEBHOOK_URL;
  if (!webhookUrl) {
    // IMPLANT 3: Critical alert when webhook missing for high-priority actions
    if (event.action === 'rotation_started' || event.action === 'critical_alert') {
      console.error('[secret-rotation] CRITICAL: INCIDENT_WEBHOOK_URL not configured; rotation events will not escalate:', {
        action: event.action,
        service: event.service,
        secret_id: event.secret_id,
        days_remaining: event.days_remaining,
      });
    }
    return;
  }

  const severityMap = {
    rotation_started: 'info',
    rotation_completed: 'success',
    warning_issued: 'warning',
    critical_alert: 'critical',
  };

  const payload = {
    service: 'secret-rotation',
    severity: severityMap[event.action],
    title: `${event.action}: ${event.service}`,
    message: `Secret rotation event for ${event.service} (ID: ${event.secret_id}). Days remaining: ${event.days_remaining}`,
    event,
    timestamp: event.rotated_at,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[secret-rotation] Webhook emit failed:', normalizeFailure(error).message);
  }
}

export async function processSecretRotation(
  secret: StoredSecret,
  supabaseAdmin: SupabaseClient,
  env: SecretRotationEnv,
): Promise<void> {
  try {
    const event = await checkSecretRotationStatus(secret, supabaseAdmin);
    if (!event) return;

    await emitRotationEvent(event, env);
  } catch (error) {
    console.error(
      `[secret-rotation] Failed to process secret ${secret.id}:`,
      normalizeFailure(error).message,
    );
    throw error;
  }
}

export async function runSecretRotationWorker(env: SecretRotationEnv): Promise<void> {
  const supabaseAdmin = createSupabaseAdmin(env);

  // IMPLANT 2b: Run schema health check before processing
  await verifySecretsTableExists(supabaseAdmin);

  const { data, error } = await supabaseAdmin
    .from('secrets')
    .select('id,service,secret_type,created_at,rotated_at,expires_at,rotation_status')
    .in('rotation_status', ['active', 'rotating']);

  if (error) throw error;

  const secrets: unknown[] = data ?? [];
  if (!Array.isArray(secrets) || secrets.length === 0) {
    console.log('[secret-rotation] No secrets to process');
    return;
  }

  const results = await Promise.allSettled(
    secrets.map((s) => processSecretRotation(s as StoredSecret, supabaseAdmin, env)),
  );

  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => normalizeFailure(r.reason));

  if (failures.length > 0) {
    console.error(
      `[secret-rotation] ${failures.length} secret(s) failed rotation check`,
      failures.map((f) => f.message),
    );
  }

  console.log(`[secret-rotation] Processed ${secrets.length} secrets, ${failures.length} failures`);
}

export default {
  async scheduled(_event: unknown, env: SecretRotationEnv, _ctx: unknown): Promise<void> {
    await runSecretRotationWorker(env);
  },
};
