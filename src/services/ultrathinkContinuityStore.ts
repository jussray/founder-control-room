import {
  ULTRATHINK_CONTINUITY_CONTRACT,
  type ContinuityReader,
  type ContinuityRevocation,
  type UltrathinkContinuityRecord,
  ultrathinkContinuityContainsSecret,
  ultrathinkContinuityHash,
  validateUltrathinkContinuityRecord,
} from '../lib/ultrathinkContinuity.js';

const FCR_PROJECT_SLUG = 'founder-control-room';
const RECORD_EVENT_TYPE = 'ultrathink_continuity_record';
const REVOCATION_EVENT_TYPE = 'ultrathink_continuity_revocation';
const SAFE_ID = /^[A-Za-z0-9._:/-]{1,160}$/;

export type ContinuityStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface UltrathinkContinuityStore extends ContinuityReader {
  persist(record: UltrathinkContinuityRecord): Promise<ContinuityStoreDisposition>;
  persistRevocation(continuationId: string, revocation: ContinuityRevocation): Promise<ContinuityStoreDisposition>;
}

function recordSourceEventId(continuationId: string): string {
  return `${ULTRATHINK_CONTINUITY_CONTRACT}:${continuationId}`;
}

function revocationSourceEventId(continuationId: string): string {
  return `${ULTRATHINK_CONTINUITY_CONTRACT}:revocation:${continuationId}`;
}

function sameMetadata(left: unknown, right: unknown): boolean {
  return ultrathinkContinuityHash(left) === ultrathinkContinuityHash(right);
}

function normalizeRevocation(continuationId: string, value: ContinuityRevocation): ContinuityRevocation {
  if (!SAFE_ID.test(continuationId)) throw new Error('ULTRATHINK_CONTINUATION_ID_INVALID');
  const revokedAtMs = Date.parse(value.revokedAt);
  if (!Number.isFinite(revokedAtMs)) throw new Error('ULTRATHINK_CONTINUITY_REVOCATION_TIME_INVALID');
  const revokedBy = value.revokedBy.trim();
  const reason = value.reason.trim();
  if (!SAFE_ID.test(revokedBy)) throw new Error('ULTRATHINK_CONTINUITY_REVOKED_BY_INVALID');
  if (!reason || reason.length > 300 || reason.includes('\u0000')) throw new Error('ULTRATHINK_CONTINUITY_REVOCATION_REASON_INVALID');
  const revocation = { revokedAt: new Date(revokedAtMs).toISOString(), revokedBy, reason };
  if (ultrathinkContinuityContainsSecret(revocation)) throw new Error('ULTRATHINK_CONTINUITY_SECRET_REJECTED');
  return revocation;
}

async function fcrProjectId(): Promise<string> {
  const { supabase } = await import('../lib/supabaseClient.js');
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', FCR_PROJECT_SLUG)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error('ultrathink_continuity_project_lookup_failed');
  if (!data?.id) throw new Error('ultrathink_continuity_project_not_found');
  return data.id as string;
}

async function loadEventMetadata(sourceEventId: string, eventType: string): Promise<unknown | null> {
  const projectId = await fcrProjectId();
  const { supabase } = await import('../lib/supabaseClient.js');
  const { data, error } = await supabase
    .from('project_events')
    .select('metadata')
    .eq('project_id', projectId)
    .eq('source_event_id', sourceEventId)
    .eq('event_type', eventType)
    .maybeSingle();
  if (error) throw new Error('ultrathink_continuity_event_lookup_failed');
  return data?.metadata ?? null;
}

async function insertEvent(sourceEventId: string, eventType: string, metadata: unknown): Promise<ContinuityStoreDisposition> {
  const projectId = await fcrProjectId();
  const { supabase } = await import('../lib/supabaseClient.js');
  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: sourceEventId,
    event_type: eventType,
    severity: 'info',
    screen: 'ultrathink-continuity',
    provider: null,
    decision: null,
    metadata,
  });
  if (!error) return 'stored';
  if ((error as { code?: string }).code !== '23505') throw new Error('ultrathink_continuity_event_store_failed');
  const existing = await loadEventMetadata(sourceEventId, eventType);
  return sameMetadata(existing, metadata) ? 'duplicate' : 'conflict';
}

export const defaultUltrathinkContinuityStore: UltrathinkContinuityStore = {
  async persist(record) {
    const errors = validateUltrathinkContinuityRecord(record);
    if (errors.length > 0) throw new Error(errors.join('; '));
    if (ultrathinkContinuityContainsSecret(record)) throw new Error('ULTRATHINK_CONTINUITY_SECRET_REJECTED');
    return insertEvent(recordSourceEventId(record.continuationId), RECORD_EVENT_TYPE, record);
  },

  async get(continuationId) {
    const metadata = await loadEventMetadata(recordSourceEventId(continuationId), RECORD_EVENT_TYPE);
    if (!metadata) return null;
    return metadata as UltrathinkContinuityRecord;
  },

  async children(parentContinuationId) {
    const projectId = await fcrProjectId();
    const { supabase } = await import('../lib/supabaseClient.js');
    const { data, error } = await supabase
      .from('project_events')
      .select('metadata')
      .eq('project_id', projectId)
      .eq('event_type', RECORD_EVENT_TYPE)
      .contains('metadata', { parentContinuationId });
    if (error) throw new Error('ultrathink_continuity_children_lookup_failed');
    return (data ?? []).map((row: { metadata: unknown }) => row.metadata as UltrathinkContinuityRecord);
  },

  async getRevocation(continuationId) {
    const metadata = await loadEventMetadata(revocationSourceEventId(continuationId), REVOCATION_EVENT_TYPE);
    return metadata as ContinuityRevocation | null;
  },

  async persistRevocation(continuationId, revocation) {
    return insertEvent(
      revocationSourceEventId(continuationId),
      REVOCATION_EVENT_TYPE,
      normalizeRevocation(continuationId, revocation),
    );
  },
};

export async function storeUltrathinkContinuity(
  record: UltrathinkContinuityRecord,
  store: UltrathinkContinuityStore = defaultUltrathinkContinuityStore,
): Promise<'stored'> {
  const errors = validateUltrathinkContinuityRecord(record);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (ultrathinkContinuityContainsSecret(record)) throw new Error('ULTRATHINK_CONTINUITY_SECRET_REJECTED');

  const existing = await store.get(record.continuationId);
  if (existing) throw new Error('ULTRATHINK_CONTINUITY_REPLAY_REJECTED');
  const disposition = await store.persist(record);
  if (disposition !== 'stored') {
    throw new Error(disposition === 'duplicate'
      ? 'ULTRATHINK_CONTINUITY_REPLAY_REJECTED'
      : 'ULTRATHINK_CONTINUITY_STORE_CONFLICT');
  }
  return 'stored';
}

export async function revokeUltrathinkContinuity(
  continuationId: string,
  revocation: ContinuityRevocation,
  store: UltrathinkContinuityStore = defaultUltrathinkContinuityStore,
): Promise<ContinuityStoreDisposition> {
  const existing = await store.get(continuationId);
  if (!existing) throw new Error('ULTRATHINK_CONTINUITY_NOT_FOUND');
  const normalized = normalizeRevocation(continuationId, revocation);
  if (Date.parse(normalized.revokedAt) < Date.parse(existing.createdAt)) {
    throw new Error('ULTRATHINK_CONTINUITY_REVOCATION_PREDATES_RECORD');
  }
  return store.persistRevocation(continuationId, normalized);
}
