import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const CONTRACT = 'founder-control-room/protect-security-event@v1';
const MAX_SKEW_MS = 5 * 60_000;
const SECRET_ENV = 'FCR_PROTECT_EVENT_INGEST_SECRET';
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPT = /^[0-9a-f]{64}$/i;
const VERDICTS = new Set(['PROBE', 'AUTOMATION', 'CLAIMED_CRAWLER']);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']);

export interface ProtectSecurityEvent {
  eventId: string;
  occurredAt: string;
  service: 'juss-protect-me-2';
  method: string;
  verdict: 'PROBE' | 'AUTOMATION' | 'CLAIMED_CRAWLER';
  shieldReceiptHash: string;
}

export type ProtectSecurityEventDisposition = 'stored' | 'duplicate' | 'conflict';
export type ProtectSecurityEventStore = (
  event: ProtectSecurityEvent,
) => Promise<ProtectSecurityEventDisposition>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function safeHexMatches(provided: string | undefined, expected: string): boolean {
  if (!provided || !RECEIPT.test(provided)) return false;
  const left = Buffer.from(provided.toLowerCase(), 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signProtectEvent(
  secret: string,
  timestamp: string,
  eventId: string,
  rawBody: Buffer,
): string {
  return createHmac('sha256', secret)
    .update(`protect-event-v1\n${timestamp}\n${eventId}\n`)
    .update(rawBody)
    .digest('hex');
}

function normalizeEvent(
  value: unknown,
  eventId: string,
  occurredAt: string,
): ProtectSecurityEvent | null {
  if (!record(value) || !exactKeys(value, ['event', 'receipt', 'receiptKind', 'transportAuthority'])) return null;
  if (!record(value.event) || !record(value.transportAuthority)) return null;
  const event = value.event;
  const authority = value.transportAuthority;
  if (!exactKeys(event, ['schema', 'service', 'method', 'pathname', 'verdict', 'identity'])) return null;
  if (!exactKeys(authority, ['level', 'canAuthorize'])) return null;
  if (event.schema !== 'protect-me/shield-event@v1' || event.service !== 'juss-protect-me-2') return null;
  if (event.pathname !== '[redacted]' || !METHODS.has(String(event.method))) return null;
  if (!VERDICTS.has(String(event.verdict))) return null;
  if (!record(event.identity) || !exactKeys(event.identity, [
    'actor', 'asn', 'country', 'userAgent', 'claimedCrawler', 'verifiedBot', 'botScore',
  ])) return null;
  // Only accept the redacted Shield shape, never raw IPs, URLs, UAs, or verified bots.
  if (event.identity.userAgent !== null || event.identity.verifiedBot !== false) return null;
  if (value.receiptKind !== 'hmac-sha256' || typeof value.receipt !== 'string' || !RECEIPT.test(value.receipt)) return null;
  if (authority.level !== 'evidence_only' || authority.canAuthorize !== false) return null;
  return {
    eventId,
    occurredAt,
    service: 'juss-protect-me-2',
    method: String(event.method),
    verdict: event.verdict as ProtectSecurityEvent['verdict'],
    // A source-supplied Shield receipt is NOT independently verified by FCR.
    shieldReceiptHash: createHash('sha256').update(value.receipt.toLowerCase()).digest('hex'),
  };
}

export const storeProtectSecurityEvent: ProtectSecurityEventStore = async (event) => {
  const { supabase } = await import('../../lib/supabaseClient.js');
  const { data: project, error: findError } = await supabase.from('projects')
    .select('id, slug, repo_provider, repo_identifier')
    .eq('slug', 'juss-protect-me-2')
    .maybeSingle();

  if (findError || !project || project.repo_provider !== 'github'
    || project.repo_identifier !== 'jussray/juss-protect-me-2') {
    throw new Error('protect_security_project_not_registered');
  }

  const metadata = { contract: CONTRACT, ...event, authority: 'observed' };
  const sourceEventId = `protect-event:v1:${event.eventId}`;
  const row = {
    project_id: project.id,
    source_event_id: sourceEventId,
    event_type: 'protect_shield_attempt',
    severity: 'warning',
    screen: 'security-review',
    provider: 'juss-protect-me-2',
    metadata,
    created_at: event.occurredAt,
  };
  const { error: insertError } = await supabase.from('project_events').insert(row);
  if (!insertError) return 'stored';
  if ((insertError as { code?: string }).code !== '23505') {
    throw new Error('protect_security_event_store_failed');
  }

  const { data: existing, error: lookupError } = await supabase.from('project_events')
    .select('metadata')
    .eq('project_id', project.id)
    .eq('source_event_id', sourceEventId)
    .maybeSingle();
  if (lookupError) throw new Error('protect_security_event_duplicate_lookup_failed');
  return JSON.stringify(existing?.metadata) === JSON.stringify(metadata) ? 'duplicate' : 'conflict';
};

export interface ProtectSecurityIngressDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  store?: ProtectSecurityEventStore;
}

export function createProtectSecurityEventIngestHandler(
  dependencies: ProtectSecurityIngressDependencies = {},
): RequestHandler {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now;
  const store = dependencies.store ?? storeProtectSecurityEvent;

  return async (req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });

    const secret = env[SECRET_ENV]?.trim();
    if (!secret || Buffer.byteLength(secret) < 32) {
      return res.status(503).json({ error: 'Protect security event ingest is not configured' });
    }
    const timestamp = req.get('x-protect-event-timestamp') ?? '';
    const eventId = req.get('x-protect-event-id') ?? '';
    const signature = req.get('x-protect-event-signature');
    if (!/^\d{10}$/.test(timestamp) || !EVENT_ID.test(eventId)
      || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const ageMs = now() - Number(timestamp) * 1000;
    if (!Number.isFinite(ageMs) || Math.abs(ageMs) > MAX_SKEW_MS) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const expected = signProtectEvent(secret, timestamp, eventId, req.body as Buffer);
    if (!safeHexMatches(signature, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let input: unknown;
    try {
      input = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_protect_event' });
    }
    const event = normalizeEvent(input, eventId.toLowerCase(), new Date(Number(timestamp) * 1000).toISOString());
    if (!event) return res.status(400).json({ error: 'invalid_protect_event' });

    try {
      const disposition = await store(event);
      // Valid replays never create a second event or grant any response authority.
      if (disposition !== 'stored') return res.status(409).json({ accepted: false, error: 'event_replay_or_conflict' });
      return res.status(201).json({ accepted: true, eventId: event.eventId, authority: 'evidence_only' });
    } catch {
      return res.status(503).json({ error: 'Protect security event store unavailable' });
    }
  };
}

export const handleProtectSecurityEventIngest = createProtectSecurityEventIngestHandler();
