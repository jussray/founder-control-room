import type { BuildEvent } from './buildEvent.js';
import { createAppAwareRepositoryProvider } from '../providers/RepositoryProviderFactory.js';
import { createHash } from 'node:crypto';

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SHA256_DIGEST = /^[0-9a-f]{64}$/i;
const HEALTHY_DEPLOYMENT_STATES = new Set([
  'active',
  'completed',
  'deployed',
  'healthy',
  'passed',
  'success',
]);
const FAILED_DEPLOYMENT_STATES = new Set([
  'cancelled',
  'error',
  'failed',
  'failure',
  'rollback',
  'rolled_back',
]);

type UnknownRecord = Record<string, unknown>;

export interface PassedCoverageProject {
  id: string;
  slug: string;
  repoProvider?: string | null;
  repoIdentifier: string | null;
}

export interface PassedCoverageWitnessInput {
  project: PassedCoverageProject;
  event: BuildEvent;
  maximumWitnessAgeSeconds: number;
  providerWitness: IndependentCoverageWitnessBinding;
  nowMs?: number;
}

export type PassedCoverageWitnessResult =
  | {
      status: 'verified';
      currentMainSha: string;
      deploymentSha: string;
      observedAt: string;
    }
  | {
      status: 'missing' | 'stale' | 'mismatch';
      code: string;
    };

export interface PassedCoverageWitnessReader {
  verify(input: PassedCoverageWitnessInput): Promise<PassedCoverageWitnessResult>;
}

/**
 * A server-owned provider observation must be bound to this exact deployment
 * target. A same-project Cloudflare observation is not enough: DNS, routes,
 * health probes, and unrelated deployments are not rollout evidence.
 */
export interface IndependentCoverageWitnessBinding {
  provider: 'cloudflare';
  resourceType: string;
  resourceId: string;
  eventType: string;
}

export interface IndependentDeploymentObservation {
  sourceEventId: string | null;
  providerEventProcessed: boolean;
  providerEventType: string | null;
  providerEventResourceType: string | null;
  providerEventResourceId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  environment: string | null;
  commitSha: string | null;
  observedAt: string | null;
  deploymentCompletedAt: string | null;
  coverageDigest: string | null;
  status: string | null;
}

export interface IndependentCoverageWitnessAssessmentInput {
  expectedReleaseSha: string;
  currentMainSha: string;
  maximumWitnessAgeSeconds: number;
  nowMs: number;
  coverageWindowStartedAt: string;
  coverageWindowEndedAt: string;
  expectedCoverageDigest: string;
  providerWitness: IndependentCoverageWitnessBinding;
  observations: readonly IndependentDeploymentObservation[];
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedSha(value: string | null): string | null {
  return value && EXACT_SHA.test(value) ? value.toLowerCase() : null;
}

function normalizedDigest(value: string | null): string | null {
  return value && SHA256_DIGEST.test(value) ? value.toLowerCase() : null;
}

function normalizedState(value: string | null): string | null {
  return value?.trim().toLowerCase().replaceAll('-', '_') ?? null;
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestFirst(
  observations: readonly IndependentDeploymentObservation[],
): IndependentDeploymentObservation[] {
  return [...observations].sort((left, right) => (
    (timestampMs(right.observedAt) ?? -1) - (timestampMs(left.observedAt) ?? -1)
  ));
}

function isTrustedProductionObservation(
  observation: IndependentDeploymentObservation,
  binding: IndependentCoverageWitnessBinding,
): boolean {
  return Boolean(
    observation.sourceEventId
      && observation.providerEventProcessed
      && observation.providerEventType === binding.eventType
      && observation.providerEventResourceType === binding.resourceType
      && observation.providerEventResourceId === binding.resourceId
      && observation.resourceType === binding.resourceType
      && observation.resourceId === binding.resourceId
      && observation.environment?.toLowerCase() === 'production',
  );
}

/**
 * The digest binds every aggregate field to a server-owned provider
 * observation without persisting routes, request identifiers, or raw logs in
 * the control plane. The Cloudflare normalizer must calculate the same digest
 * from its independent aggregate before it writes `coverage_digest`.
 */
export function coverageWitnessDigest(coverage: NonNullable<BuildEvent['coverage']>): string {
  const canonical = {
    contract: 'fcr/coverage-witness@v1',
    service: coverage.service,
    environment: coverage.environment,
    releaseSha: coverage.releaseSha.toLowerCase(),
    windowStartedAt: new Date(coverage.windowStartedAt).toISOString(),
    windowEndedAt: new Date(coverage.windowEndedAt).toISOString(),
    sampleSource: coverage.sampleSource,
    requestCount: coverage.requestCount,
    currentReleaseRequestCount: coverage.currentReleaseRequestCount,
    priorReleaseRequestCount: coverage.priorReleaseRequestCount,
    unclassifiedRequestCount: coverage.unclassifiedRequestCount,
    routeClasses: [...coverage.routeClasses]
      .map((routeClass) => ({ ...routeClass }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    tailReasons: [...(coverage.tailReasons ?? [])].sort(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Assesses server-owned evidence only. Caller-supplied receipt fields provide
 * expected values that must exactly match independent provider evidence;
 * `project_events` is deliberately excluded so a receipt cannot witness
 * itself.
 */
export function assessIndependentCoverageWitness(
  input: IndependentCoverageWitnessAssessmentInput,
): PassedCoverageWitnessResult {
  const expectedReleaseSha = normalizedSha(input.expectedReleaseSha);
  const currentMainSha = normalizedSha(input.currentMainSha);
  if (!expectedReleaseSha || !currentMainSha) {
    return { status: 'missing', code: 'coverage_witness_exact_sha_unavailable' };
  }
  if (currentMainSha !== expectedReleaseSha) {
    return { status: 'mismatch', code: 'coverage_witness_current_main_mismatch' };
  }

  const coverageWindowStartedAtMs = timestampMs(input.coverageWindowStartedAt);
  const coverageWindowEndedAtMs = timestampMs(input.coverageWindowEndedAt);
  if (
    coverageWindowStartedAtMs === null
    || coverageWindowEndedAtMs === null
    || coverageWindowEndedAtMs <= coverageWindowStartedAtMs
  ) {
    return { status: 'missing', code: 'coverage_witness_coverage_window_invalid' };
  }
  const expectedCoverageDigest = normalizedDigest(input.expectedCoverageDigest);
  if (!expectedCoverageDigest) {
    return { status: 'missing', code: 'coverage_witness_coverage_digest_invalid' };
  }

  const latest = latestFirst(
    input.observations.filter((observation) => (
      isTrustedProductionObservation(observation, input.providerWitness)
    )),
  )[0];
  if (!latest) return { status: 'missing', code: 'coverage_witness_cloudflare_observation_missing' };

  const observedAtMs = timestampMs(latest.observedAt);
  if (observedAtMs === null) {
    return { status: 'stale', code: 'coverage_witness_cloudflare_observation_timestamp_invalid' };
  }
  if (observedAtMs > input.nowMs || input.nowMs - observedAtMs > input.maximumWitnessAgeSeconds * 1_000) {
    return { status: 'stale', code: 'coverage_witness_cloudflare_observation_stale' };
  }
  if (observedAtMs < coverageWindowEndedAtMs) {
    return { status: 'stale', code: 'coverage_witness_coverage_observation_precedes_window' };
  }

  const deploymentCompletedAtMs = timestampMs(latest.deploymentCompletedAt);
  if (deploymentCompletedAtMs === null) {
    return { status: 'missing', code: 'coverage_witness_deployment_completion_missing' };
  }
  if (deploymentCompletedAtMs > coverageWindowStartedAtMs) {
    return { status: 'mismatch', code: 'coverage_witness_deployment_after_coverage_window' };
  }

  const deploymentState = normalizedState(latest.status);
  if (deploymentState && FAILED_DEPLOYMENT_STATES.has(deploymentState)) {
    return { status: 'stale', code: 'coverage_witness_newer_cloudflare_failure' };
  }

  const deploymentSha = normalizedSha(latest.commitSha);
  if (!deploymentSha) return { status: 'missing', code: 'coverage_witness_deployment_sha_missing' };
  if (deploymentSha !== expectedReleaseSha) {
    return { status: 'mismatch', code: 'coverage_witness_deployment_sha_mismatch' };
  }
  if (!deploymentState || !HEALTHY_DEPLOYMENT_STATES.has(deploymentState)) {
    return { status: 'missing', code: 'coverage_witness_deployment_health_missing' };
  }
  if (normalizedDigest(latest.coverageDigest) !== expectedCoverageDigest) {
    return { status: 'mismatch', code: 'coverage_witness_independent_aggregate_mismatch' };
  }

  return {
    status: 'verified',
    currentMainSha,
    deploymentSha,
    observedAt: latest.observedAt!,
  };
}

function observationFromRow(
  value: unknown,
  providerEvents: ReadonlyMap<string, ProviderEventIdentity>,
): IndependentDeploymentObservation {
  const row = asRecord(value);
  const state = asRecord(row['observed_state']);
  const sourceEventId = asString(row['source_event_id']);
  const providerEvent = sourceEventId ? providerEvents.get(sourceEventId) : undefined;
  return {
    sourceEventId,
    providerEventProcessed: providerEvent?.processed ?? false,
    providerEventType: providerEvent?.eventType ?? null,
    providerEventResourceType: providerEvent?.resourceType ?? null,
    providerEventResourceId: providerEvent?.resourceId ?? null,
    resourceType: asString(row['resource_type']),
    resourceId: asString(row['resource_id']),
    environment: asString(state['environment']),
    commitSha: normalizedSha(
      asString(state['commit_sha'])
        ?? asString(state['head_sha'])
        ?? asString(state['sha']),
    ),
    observedAt: asString(row['observed_at']),
    deploymentCompletedAt: asString(state['deployment_completed_at']),
    coverageDigest: normalizedDigest(asString(state['coverage_digest'])),
    status: asString(state['status'])
      ?? asString(state['state'])
      ?? asString(state['conclusion'])
      ?? asString(state['health']),
  };
}

interface ProviderEventIdentity {
  processed: boolean;
  eventType: string | null;
  resourceType: string | null;
  resourceId: string | null;
}

async function loadIndependentCloudflareObservations(
  projectId: string,
  binding: IndependentCoverageWitnessBinding,
): Promise<IndependentDeploymentObservation[]> {
  const { supabase } = await import('../lib/supabaseClient.js');
  const observationsResult = await supabase
    .from('provider_observations')
    .select('resource_type,resource_id,observed_state,observed_at,source_event_id')
    .eq('project_id', projectId)
    .eq('provider', binding.provider)
    .eq('resource_type', binding.resourceType)
    .eq('resource_id', binding.resourceId)
    .order('observed_at', { ascending: false })
    .limit(50);
  if (observationsResult.error) throw new Error('coverage_witness_cloudflare_observations_unavailable');

  const observationRows = (observationsResult.data ?? []) as unknown[];
  const sourceEventIds = observationRows
    .map((row) => asString(asRecord(row)['source_event_id']))
    .filter((id): id is string => Boolean(id));
  if (sourceEventIds.length === 0) {
    return observationRows.map((row) => observationFromRow(row, new Map()));
  }

  const sourceEventsResult = await supabase
    .from('provider_events')
    .select('id,provider,processing_status,event_type,resource_type,resource_id')
    .eq('project_id', projectId)
    .eq('provider', binding.provider)
    .eq('event_type', binding.eventType)
    .eq('resource_type', binding.resourceType)
    .eq('resource_id', binding.resourceId)
    .in('id', sourceEventIds);
  if (sourceEventsResult.error) throw new Error('coverage_witness_cloudflare_source_events_unavailable');

  const providerEvents = new Map<string, ProviderEventIdentity>(
    ((sourceEventsResult.data ?? []) as unknown[])
      .map(asRecord)
      .map((row) => {
        const id = asString(row['id']);
        return id
          ? [id, {
              processed: row['processing_status'] === 'processed',
              eventType: asString(row['event_type']),
              resourceType: asString(row['resource_type']),
              resourceId: asString(row['resource_id']),
            }] as const
          : null;
      })
      .filter((entry): entry is readonly [string, ProviderEventIdentity] => Boolean(entry)),
  );
  return observationRows.map((row) => observationFromRow(row, providerEvents));
}

export function createDefaultPassedCoverageWitnessReader(
  env: NodeJS.ProcessEnv = process.env,
): PassedCoverageWitnessReader {
  return {
    async verify(input: PassedCoverageWitnessInput): Promise<PassedCoverageWitnessResult> {
      const expectedReleaseSha = input.event.coverage?.releaseSha;
      if (!expectedReleaseSha) {
        return { status: 'missing', code: 'coverage_witness_release_sha_missing' };
      }
      if (!input.project.repoProvider || !input.project.repoIdentifier) {
        return { status: 'missing', code: 'coverage_witness_repository_connection_missing' };
      }
      if (!input.event.coverage) {
        return { status: 'missing', code: 'coverage_witness_coverage_missing' };
      }

      // Read a separate, server-owned Cloudflare evidence lane first. It never
      // consults project_events, where the submitted receipt will be stored.
      const observations = await loadIndependentCloudflareObservations(
        input.project.id,
        input.providerWitness,
      );
      const provider = await createAppAwareRepositoryProvider({
        slug: input.project.slug,
        repoProvider: input.project.repoProvider,
        repoIdentifier: input.project.repoIdentifier,
      }, env);
      const project = await provider.getProject(input.project.slug);
      if (project.defaultBranch !== 'main') {
        return { status: 'mismatch', code: 'coverage_witness_default_branch_not_main' };
      }

      // Resolve main last, immediately before the receipt can be persisted.
      const currentMainSha = await provider.resolveRef(input.project.slug, project.defaultBranch);
      return assessIndependentCoverageWitness({
        expectedReleaseSha,
        currentMainSha,
        maximumWitnessAgeSeconds: input.maximumWitnessAgeSeconds,
        nowMs: input.nowMs ?? Date.now(),
        coverageWindowStartedAt: input.event.coverage.windowStartedAt,
        coverageWindowEndedAt: input.event.coverage.windowEndedAt,
        expectedCoverageDigest: coverageWitnessDigest(input.event.coverage),
        providerWitness: input.providerWitness,
        observations,
      });
    },
  };
}
