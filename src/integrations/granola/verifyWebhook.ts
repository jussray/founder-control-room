/** Signature verifier only. No webhook ingress or background event processing is enabled. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface GranolaWebhookEvent {
  event_id: string;
  event_type: 'note.generated' | 'note.edited' | 'note.access_granted';
  note_id: string;
  occurred_at: string;
}

const NOTE_ID = /^not_[A-Za-z0-9]{14}$/i;
const EVENTS = new Set(['note.generated', 'note.edited', 'note.access_granted']);
const WINDOW_SECONDS = 300;

function header(headers: Record<string, string | undefined>, name: string): string {
  return headers[name] ?? headers[name.toLowerCase()] ?? '';
}

export function verifyGranolaWebhook(
  headers: Record<string, string | undefined>,
  rawBody: string,
  signingSecret: string,
  nowMs = Date.now(),
): GranolaWebhookEvent | null {
  if (!signingSecret?.startsWith('whsec_') || rawBody.length > 16_384) return null;
  const id = header(headers, 'webhook-id');
  const timestamp = header(headers, 'webhook-timestamp');
  const signature = header(headers, 'webhook-signature');
  if (!id || !/^\d{10}$/.test(timestamp)) return null;
  const age = nowMs / 1000 - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > WINDOW_SECONDS) return null;
  const key = Buffer.from(signingSecret.slice('whsec_'.length), 'base64');
  if (key.length < 8) return null;
  const expected = createHmac('sha256', key)
    .update(id + '.' + timestamp + '.' + rawBody, 'utf8').digest();
  let valid = false;
  for (const part of signature.split(/\s+/)) {
    const [version, encoded] = part.split(',', 2);
    if (version !== 'v1' || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) continue;
    const actual = Buffer.from(encoded, 'base64');
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) valid = true;
  }
  if (!valid) return null;
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.event_id !== id || typeof event.event_type !== 'string' || !EVENTS.has(event.event_type)
    || typeof event.note_id !== 'string' || !NOTE_ID.test(event.note_id)
    || typeof event.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at))) {
    return null;
  }
  return {
    event_id: id,
    event_type: event.event_type as GranolaWebhookEvent['event_type'],
    note_id: event.note_id,
    occurred_at: event.occurred_at,
  };
}
