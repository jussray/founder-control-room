import { supabase } from '../lib/supabaseClient.js';
import {
  BUILD_EVENT_CONTRACT,
  createBuildEvent,
  type BuildEvent,
  type BuildEventInput,
} from '../buildEvents/buildEvent.js';

export type BuildEventStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface BuildEventReadResult {
  events: BuildEvent[];
  invalidStoredEvents: number;
}

const BUILD_EVENT_TYPE = 'build_event';
const BUILD_EVENT_LIMIT = 500;
const BUILD_EVENT_SOURCE_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function storedEvent(value: unknown): BuildEvent | null {
  if (!isRecord(value) || value.contract !== BUILD_EVENT_CONTRACT) return null;
  try {
    return createBuildEvent(value as unknown as BuildEventInput);
  } catch {
    return null;
  }
}

function sourceEventId(eventId: string): string {
  return `${BUILD_EVENT_CONTRACT}:${eventId}`;
}

function severity(event: BuildEvent): 'info' | 'warning' | 'error' {
  if (event.status === 'failed') return 'error';
  if (event.status === 'blocked') return 'warning';
  return 'info';
}

function sameEvent(left: BuildEvent, right: BuildEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isVerifiedLastObservedMainSource(event: BuildEvent): boolean {
  return event.source === 'github'
    && event.truth === 'verified'
    && event.authority === 'observed'
    && event.category === 'source'
    && event.status === 'completed'
    && event.repository?.refKind === 'branch-head'
    && event.repository.branch === 'main'
    && Boolean(event.repository.commitSha);
}

export async function storeBuildEvent(
  projectId: string,
  input: BuildEvent | BuildEventInput,
): Promise<BuildEventStoreDisposition> {
  const event = createBuildEvent(input);
  const dedupeId = sourceEventId(event.eventId);

  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: dedupeId,
    event_type: BUILD_EVENT_TYPE,
    severity: severity(event),
    screen: 'ambient-build-memory',
    provider: event.provider?.name ?? (event.source === 'founder' ? null : event.source),
    decision: event.decision?.value ?? null,
    metadata: event,
    created_at: event.occurredAt,
  });

  if (!error) return 'stored';
  if ((error as { code?: string }).code !== '23505') {
    throw new Error('build_event_store_failed');
  }

  const { data: existing, error: lookupError } = await supabase
    .from('project_events')
    .select('metadata')
    .eq('project_id', projectId)
    .eq('source_event_id', dedupeId)
    .maybeSingle();

  if (lookupError) throw new Error('build_event_duplicate_lookup_failed');
  const normalizedExisting = storedEvent(existing?.metadata);
  if (!normalizedExisting) return 'conflict';
  return sameEvent(normalizedExisting, event) ? 'duplicate' : 'conflict';
}

export async function loadBuildEvents(projectId: string): Promise<BuildEventReadResult> {
  const [eventsResult, mainSourceResult] = await Promise.all([
    supabase
      .from('project_events')
      .select('metadata, created_at')
      .eq('project_id', projectId)
      .eq('event_type', BUILD_EVENT_TYPE)
      .order('created_at', { ascending: false })
      .limit(BUILD_EVENT_LIMIT),
    // Retain the latest GitHub-observed main-source provenance even when
    // high-volume observations push it out of the bounded general feed. It
    // is explicitly *not* current-main proof: webhook delivery can be late
    // or out of order, so current truth requires a distinct canonical
    // revalidation witness.
    supabase
      .from('project_events')
      .select('metadata, created_at')
      .eq('project_id', projectId)
      .eq('event_type', BUILD_EVENT_TYPE)
      .contains('metadata', {
        contract: BUILD_EVENT_CONTRACT,
        source: 'github',
        category: 'source',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: { branch: 'main', refKind: 'branch-head' },
      })
      .order('created_at', { ascending: false })
      .limit(BUILD_EVENT_SOURCE_LIMIT),
  ]);

  if (eventsResult.error || mainSourceResult.error) throw new Error('build_event_read_failed');

  const events: BuildEvent[] = [];
  let invalidStoredEvents = 0;
  for (const row of eventsResult.data ?? []) {
    const event = storedEvent(row.metadata);
    if (!event) {
      invalidStoredEvents += 1;
      continue;
    }
    events.push(event);
  }

  for (const row of mainSourceResult.data ?? []) {
    const event = storedEvent(row.metadata);
    if (!event) {
      invalidStoredEvents += 1;
      continue;
    }
    if (!isVerifiedLastObservedMainSource(event)) continue;
    if (!events.some((existing) => existing.eventId === event.eventId)) events.push(event);
    break;
  }

  return { events, invalidStoredEvents };
}
