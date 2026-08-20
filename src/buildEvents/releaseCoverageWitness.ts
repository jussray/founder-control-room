import type { BuildEvent } from './buildEvent.js';
import { createRepositoryProvider } from '../providers/RepositoryProviderFactory.js';

const EXACT_SHA = /^[0-9a-f]{40}$/i;
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

export interface IndependentDeploymentObservation {
  sourceEventId: string | null;
  providerEventProcessed: boolean;
  environment: string | null;
  commitSha: string | null;
  observedAt: string | null;
  status: string | null;
}

export interface IndependentCoverageWitnessAssessmentInput {
  expectedReleaseSha: string;
  currentMainSha: string;
  maximumWitnessAgeSeconds: number;
  nowMs: number;
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

function isTrustedProductionObservation(observation: IndependentDeploymentObservation): boolean {
  return Boolean(
    observation.sourceEventId
      && observation.providerEventProcessed
      && observation.environment?.toLowerCase() === 'production',
  );
}

/**
 * Assesses server-owned evidence only. Caller-supplied build-event data is not
 * an input here other than the expected SHA; `project_events` is deliberately
 * excluded so a receipt cannot witness itself.
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

  const latest = latestFirst(input.observations.filter(isTrustedProductionObservation))[0];
  if (!latest) return { status: 'missing', code: 'coverage_witness_cloudflare_observation_missing' };

  const observedAtMs = timestampMs(latest.observedAt);
  if (observedAtMs === null) {
    return { status: 'stale', code: 'coverage_witness_cloudflare_observation_timestamp_invalid' };
  }
  if (observedAtMs > input.nowMs || input.nowMs - observedAtMs > input.maximumWitnessAgeSeconds * 1_000) {
    return { status: 'stale', code: 'coverage_witness_cloudflare_observation_stale' };
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

  return {
    status: 'verified',
    currentMainSha,
    deploymentSha,
    observedAt: latest.observedAt!,
  };
}

function observationFromRow(
  value: unknown,
  processedProviderEventIds: ReadonlySet<string>,
): IndependentDeploymentObservation {
  const row = asRecord(value);
  const state = asRecord(row['observed_state']);
  const sourceEventId = asString(row['source_event_id']);
  return {
    sourceEventId,
    providerEventProcessed: Boolean(sourceEventId && processedProviderEventIds.has(sourceEventId)),
    environment: asString(state['environment']),
    commitSha: normalizedSha(
      asString(state['commit_sha'])
        ?? asString(state['head_sha'])
        ?? asString(state['sha']),
    ),
    observedAt: asString(row['observed_at']),
    status: asString(state['status'])
      ?? asString(state['state'])
      ?? asString(state['conclusion'])
      ?? asString(state['health']),
  };
}

async function loadIndependentCloudflareObservations(
  projectId: string,
): Promise<IndependentDeploymentObservation[]> {
  const { supabase } = await import('../lib/supabaseClient.js');
  const observationsResult = await supabase
    .from('provider_observations')
    .select('observed_state,observed_at,source_event_id')
    .eq('project_id', projectId)
    .eq('provider', 'cloudflare')
    .order('observed_at', { ascending: false })
    .limit(50);
  if (observationsResult.error) throw new Error('coverage_witness_cloudflare_observations_unavailable');

  const observationRows = (observationsResult.data ?? []) as unknown[];
  const sourceEventIds = observationRows
    .map((row) => asString(asRecord(row)['source_event_id']))
    .filter((id): id is string => Boolean(id));
  if (sourceEventIds.length === 0) {
    return observationRows.map((row) => observationFromRow(row, new Set()));
  }

  const sourceEventsResult = await supabase
    .from('provider_events')
    .select('id,provider,processing_status')
    .eq('project_id', projectId)
    .in('id', sourceEventIds);
  if (sourceEventsResult.error) throw new Error('coverage_witness_cloudflare_source_events_unavailable');

  const processedProviderEventIds = new Set(
    ((sourceEventsResult.data ?? []) as unknown[])
      .map(asRecord)
      .filter((row) => row['provider'] === 'cloudflare' && row['processing_status'] === 'processed')
      .map((row) => asString(row['id']))
      .filter((id): id is string => Boolean(id)),
  );
  return observationRows.map((row) => observationFromRow(row, processedProviderEventIds));
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

      // Read a separate, server-owned Cloudflare evidence lane first. It never
      // consults project_events, where the submitted receipt will be stored.
      const observations = await loadIndependentCloudflareObservations(input.project.id);
      const provider = createRepositoryProvider({
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
        observations,
      });
    },
  };
}
