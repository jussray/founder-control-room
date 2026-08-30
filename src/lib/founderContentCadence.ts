export const FOUNDER_CONTENT_CADENCE_POLICY = 'founder-content-hourly-cap-v1' as const;
export const FOUNDER_CONTENT_MIN_GAP_MINUTES = 60 as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;

export interface FounderContentCadenceReservationInput {
  provider: string;
  channel: string;
  contentId: string;
  requestedScheduleAt: string;
  approvalExpiresAt?: string;
}

export interface FounderContentCadenceReservation {
  reservationId: string;
  policyId: typeof FOUNDER_CONTENT_CADENCE_POLICY;
  provider: string;
  channel: string;
  contentId: string;
  requestedScheduleAt: string;
  reservedScheduleAt: string;
  deferredSeconds: number;
  deferred: boolean;
}

export interface FounderContentCadenceTelemetry {
  event: 'fcr:founder-content-cadence';
  policyId: typeof FOUNDER_CONTENT_CADENCE_POLICY;
  provider: string;
  channel: string;
  deferred: boolean;
  deferredSeconds: number;
  minimumGapMinutes: typeof FOUNDER_CONTENT_MIN_GAP_MINUTES;
}

interface RpcError {
  message: string;
}

interface CadenceRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export interface CadenceSchedulableEnvelope {
  provider: string;
  channel: string;
  content_id: string;
  provider_request: {
    schedule_at: string;
    review_deadline?: string | null;
  };
}

function clean(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function iso(value: unknown, label: string): string {
  const raw = clean(value, 64);
  const parsed = Date.parse(raw);
  if (!raw || Number.isNaN(parsed)) {
    throw new Error(`FOUNDER_CONTENT_CADENCE_INVALID: ${label} must be RFC3339`);
  }
  return new Date(parsed).toISOString();
}

function validateInput(input: FounderContentCadenceReservationInput) {
  const provider = clean(input.provider, 80).toLowerCase();
  const channel = clean(input.channel, 160).toLowerCase();
  const contentId = clean(input.contentId, 80).toLowerCase();
  const requestedScheduleAt = iso(input.requestedScheduleAt, 'requestedScheduleAt');
  const approvalExpiresAt = iso(input.approvalExpiresAt, 'approvalExpiresAt');

  if (!IDENTIFIER.test(provider)) throw new Error('FOUNDER_CONTENT_CADENCE_INVALID: provider is invalid');
  if (!IDENTIFIER.test(channel)) throw new Error('FOUNDER_CONTENT_CADENCE_INVALID: channel is invalid');
  if (!UUID.test(contentId)) throw new Error('FOUNDER_CONTENT_CADENCE_INVALID: contentId must be a UUID');
  if (Date.parse(requestedScheduleAt) >= Date.parse(approvalExpiresAt)) {
    throw new Error('FOUNDER_CONTENT_CADENCE_INVALID: approvalExpiresAt must be later than requestedScheduleAt');
  }

  return { provider, channel, contentId, requestedScheduleAt, approvalExpiresAt };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : null;
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

export async function reserveFounderContentCadence(
  input: FounderContentCadenceReservationInput,
  rpcClient?: CadenceRpcClient,
): Promise<FounderContentCadenceReservation> {
  const validated = validateInput(input);
  const client = rpcClient ?? (await import('./supabaseClient.js')).supabase;
  const { data, error } = await client.rpc('reserve_founder_content_cadence', {
    p_provider: validated.provider,
    p_channel: validated.channel,
    p_content_id: validated.contentId,
    p_requested_schedule_at: validated.requestedScheduleAt,
    p_approval_expires_at: validated.approvalExpiresAt,
  });

  if (error) {
    throw new Error(`FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: ${clean(error.message, 500) || 'database reservation failed'}`);
  }

  const row = firstRow(data);
  if (!row) throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: database returned no reservation');

  const reservationId = clean(row.reservation_id, 80).toLowerCase();
  const policyId = clean(row.cadence_policy_id, 120);
  const requestedScheduleAt = iso(row.requested_schedule_at, 'reservation.requestedScheduleAt');
  const reservedScheduleAt = iso(row.reserved_schedule_at, 'reservation.reservedScheduleAt');
  const deferredSeconds = Number(row.deferred_seconds);

  if (!UUID.test(reservationId)) throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: reservation id is invalid');
  if (policyId !== FOUNDER_CONTENT_CADENCE_POLICY) {
    throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: cadence policy identity mismatch');
  }
  if (Date.parse(requestedScheduleAt) > Date.parse(validated.requestedScheduleAt)) {
    throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: reservation requested schedule may not postdate current request');
  }
  if (!Number.isInteger(deferredSeconds) || deferredSeconds < 0) {
    throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: deferred seconds is invalid');
  }
  if (Date.parse(reservedScheduleAt) < Date.parse(requestedScheduleAt)) {
    throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: reserved schedule may not predate requested schedule');
  }
  if (Date.parse(reservedScheduleAt) >= Date.parse(validated.approvalExpiresAt)) {
    throw new Error('FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: reserved schedule must remain before approval expiry');
  }

  return Object.freeze({
    reservationId,
    policyId: FOUNDER_CONTENT_CADENCE_POLICY,
    provider: validated.provider,
    channel: validated.channel,
    contentId: validated.contentId,
    requestedScheduleAt,
    reservedScheduleAt,
    deferredSeconds,
    deferred: deferredSeconds > 0,
  });
}

export function applyFounderContentCadenceSchedule<T extends CadenceSchedulableEnvelope>(
  envelope: T,
  reservation: FounderContentCadenceReservation,
): T {
  const provider = clean(envelope.provider, 80).toLowerCase();
  const channel = clean(envelope.channel, 160).toLowerCase();
  const contentId = clean(envelope.content_id, 80).toLowerCase();
  const currentRequestedScheduleAt = iso(envelope.provider_request?.schedule_at, 'envelope.provider_request.schedule_at');

  if (provider !== reservation.provider || channel !== reservation.channel || contentId !== reservation.contentId) {
    throw new Error('FOUNDER_CONTENT_CADENCE_APPLY_REJECTED: reservation destination identity mismatch');
  }
  if (Date.parse(reservation.requestedScheduleAt) > Date.parse(currentRequestedScheduleAt)) {
    throw new Error('FOUNDER_CONTENT_CADENCE_APPLY_REJECTED: reservation review origin may not postdate current request');
  }

  return {
    ...envelope,
    provider_request: {
      ...envelope.provider_request,
      schedule_at: reservation.reservedScheduleAt,
      ...(Object.hasOwn(envelope.provider_request, 'review_deadline')
        ? { review_deadline: reservation.requestedScheduleAt }
        : {}),
    },
  } as T;
}

export function buildFounderContentCadenceTelemetry(
  reservation: FounderContentCadenceReservation,
): FounderContentCadenceTelemetry {
  return Object.freeze({
    event: 'fcr:founder-content-cadence',
    policyId: FOUNDER_CONTENT_CADENCE_POLICY,
    provider: reservation.provider,
    channel: reservation.channel,
    deferred: reservation.deferred,
    deferredSeconds: reservation.deferredSeconds,
    minimumGapMinutes: FOUNDER_CONTENT_MIN_GAP_MINUTES,
  });
}
