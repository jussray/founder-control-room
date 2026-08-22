import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { createBuildEvent, type BuildEvent, type BuildEventInput } from '../../buildEvents/buildEvent.js';
import {
  createDefaultPassedCoverageWitnessReader,
  type IndependentCoverageWitnessBinding,
  type PassedCoverageProject,
  type PassedCoverageWitnessReader,
} from '../../buildEvents/releaseCoverageWitness.js';
import type { BuildEventStoreDisposition } from '../../services/buildEventStore.js';

const TOKEN_CONTEXT = 'founder-control-room/build-event-receipts/v2';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export interface BuildReleaseCoveragePolicy {
  service: string;
  environment: 'production';
  source: BuildEventInput['source'];
  minimumWindowSeconds: number;
  maximumWindowSeconds: number;
  maximumObservationAgeSeconds: number;
  maximumWitnessAgeSeconds: number;
  minimumRequestCount: number;
  maximumPriorReleaseShareBps: number;
  allowedRouteClasses: readonly string[];
  providerWitness: IndependentCoverageWitnessBinding;
}

export interface BuildEventProducerPolicy {
  projectSlug: string;
  repository: string;
  repositoryProvider: 'github';
  sources: readonly BuildEventInput['source'][];
  categories: readonly BuildEventInput['category'][];
  coverage?: BuildReleaseCoveragePolicy;
}

export const BUILD_EVENT_PRODUCERS: Readonly<Record<string, BuildEventProducerPolicy>> = {
  'sekret-bip-release-observer': {
    projectSlug: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
    repositoryProvider: 'github',
    // This credential belongs to the aggregate coverage observer only. It
    // must not be able to self-label runtime, CI, or provider authority.
    sources: ['cloudflare'],
    categories: ['analytics'],
    coverage: {
      service: 'sekret-bip-production',
      environment: 'production',
      source: 'cloudflare',
      minimumWindowSeconds: 15 * 60,
      maximumWindowSeconds: 30 * 60,
      maximumObservationAgeSeconds: 60 * 60,
      maximumWitnessAgeSeconds: 15 * 60,
      minimumRequestCount: 25,
      maximumPriorReleaseShareBps: 500,
      allowedRouteClasses: ['front-door'],
      providerWitness: {
        provider: 'cloudflare',
        resourceType: 'worker-deployment',
        resourceId: 'sekret-bip-production',
        eventType: 'deployment.completed',
      },
    },
  },
};

interface ProjectRecord extends PassedCoverageProject {}

export interface BuildEventReceiptDependencies {
  env?: NodeJS.ProcessEnv;
  findProject?: (slug: string) => Promise<ProjectRecord | null>;
  storeEvent?: (projectId: string, event: BuildEvent) => Promise<BuildEventStoreDisposition>;
  passedCoverageWitnessReader?: PassedCoverageWitnessReader;
  now?: () => number;
}

function headers(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function safeToken(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = safeToken(provided);
  const right = safeToken(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function deriveBuildEventReceiptToken(
  rootToken: string,
  producer: string,
  projectSlug: string,
): string {
  const target = projectSlug.trim();
  if (!target) throw new Error('build-event receipt project binding is required');
  return createHmac('sha256', rootToken)
    .update(`${TOKEN_CONTEXT}:${producer}:${target}`)
    .digest('hex');
}

async function findProject(slug: string): Promise<ProjectRecord | null> {
  const { supabase } = await import('../../lib/supabaseClient.js');
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, repo_provider, repo_identifier')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error('project_lookup_failed');
  if (!data) return null;
  return {
    id: String(data.id),
    slug: String(data.slug),
    repoProvider: data.repo_provider ? String(data.repo_provider) : null,
    repoIdentifier: data.repo_identifier ? String(data.repo_identifier) : null,
  };
}

async function storeEvent(
  projectId: string,
  event: BuildEvent,
): Promise<BuildEventStoreDisposition> {
  const { storeBuildEvent } = await import('../../services/buildEventStore.js');
  return storeBuildEvent(projectId, event);
}

function policyError(
  event: BuildEvent,
  producerPolicy: BuildEventProducerPolicy,
  project: ProjectRecord,
  nowMs: number,
): string | null {
  if (event.authority === 'authorized') return 'external_receipts_cannot_authorize';
  if (event.source === 'founder') return 'external_receipts_cannot_impersonate_founder';
  if (event.source === 'system') return 'external_receipts_cannot_impersonate_system';
  if (event.goal || event.nextGate) return 'external_receipts_cannot_set_control_plane_intent';
  if (event.repository?.auditedCommitSha) return 'external_receipts_cannot_set_audited_identity';
  if (event.provider || event.runtime || event.verification || event.decision) {
    return 'coverage_receipt_contains_unallowed_control_fact';
  }
  if (!producerPolicy.sources.includes(event.source)) return 'producer_source_not_allowed';
  if (!producerPolicy.categories.includes(event.category)) return 'producer_category_not_allowed';
  if (project.slug !== producerPolicy.projectSlug) return 'producer_project_mismatch';
  if (project.repoIdentifier !== producerPolicy.repository) return 'producer_project_mismatch';
  if (project.repoProvider?.toLowerCase() !== producerPolicy.repositoryProvider) {
    return 'producer_repository_provider_mismatch';
  }
  if (event.repository?.name !== producerPolicy.repository) return 'event_repository_mismatch';
  if (!event.repository?.commitSha) return 'exact_commit_sha_required';
  if (event.repository.branch !== 'main' || event.repository.refKind !== 'branch-head') {
    return 'production_receipt_requires_main_branch_head';
  }

  const occurredAtMs = Date.parse(event.occurredAt);
  if (occurredAtMs > nowMs + MAX_FUTURE_SKEW_MS) return 'event_occurred_at_too_far_in_future';
  if (occurredAtMs < nowMs - MAX_EVENT_AGE_MS) return 'event_receipt_expired';

  if (event.coverage) {
    const coveragePolicy = producerPolicy.coverage;
    if (!coveragePolicy) return 'coverage_receipts_not_configured_for_producer';
    if (event.coverage.service !== coveragePolicy.service) return 'coverage_service_not_allowed';
    if (event.coverage.environment !== coveragePolicy.environment) return 'coverage_environment_not_allowed';
    if (event.source !== coveragePolicy.source) return 'coverage_source_not_allowed';
    if (!event.coverage.routeClasses.every((routeClass) => (
      coveragePolicy.allowedRouteClasses.includes(routeClass.name)
    ))) {
      return 'coverage_route_class_not_allowed';
    }
    if (event.coverage.releaseSha !== event.repository.commitSha) {
      return 'coverage_release_sha_mismatch';
    }
    if (event.status !== 'passed') return 'coverage_receipt_requires_passed_status';

    const coverageWindowStartedAtMs = Date.parse(event.coverage.windowStartedAt);
    const coverageWindowEndedAtMs = Date.parse(event.coverage.windowEndedAt);
    const coverageWindowMs = coverageWindowEndedAtMs - coverageWindowStartedAtMs;
    if (coverageWindowMs > coveragePolicy.maximumWindowSeconds * 1_000) {
      return 'coverage_window_too_long';
    }
    if (coverageWindowEndedAtMs > occurredAtMs) {
      return 'coverage_window_ends_after_receipt';
    }
    if (coverageWindowEndedAtMs > nowMs) {
      return 'coverage_window_ends_in_future';
    }
    if (nowMs - coverageWindowEndedAtMs > coveragePolicy.maximumObservationAgeSeconds * 1_000) {
      return 'coverage_window_too_old';
    }

    if (coverageWindowMs < coveragePolicy.minimumWindowSeconds * 1_000) {
      return 'coverage_window_too_short';
    }
    if (event.coverage.requestCount < coveragePolicy.minimumRequestCount) {
      return 'coverage_minimum_request_count_not_met';
    }
    if (event.coverage.unclassifiedRequestCount > 0) {
      return 'coverage_unclassified_requests_not_allowed';
    }
    if (
      event.coverage.priorReleaseRequestCount * 10_000
      > coveragePolicy.maximumPriorReleaseShareBps * event.coverage.requestCount
    ) {
      return 'coverage_prior_release_share_above_policy';
    }
    if (event.coverage.tailReasons?.includes('unknown')) {
      return 'coverage_unknown_tail_not_allowed';
    }
  }

  if (producerPolicy.coverage && !event.coverage) {
    return 'coverage_required_for_producer';
  }
  if (producerPolicy.coverage && event.phase !== 'observe') {
    return 'coverage_receipt_requires_observe_phase';
  }

  if (event.truth === 'verified' && event.evidenceRefs.length === 0 && event.evidenceUrls.length === 0) {
    return 'verified_receipt_requires_evidence';
  }
  return null;
}

export function createBuildEventReceiptIngestHandler(
  dependencies: BuildEventReceiptDependencies = {},
): RequestHandler {
  const env = dependencies.env ?? process.env;
  const projectLookup = dependencies.findProject ?? findProject;
  const eventStore = dependencies.storeEvent ?? storeEvent;
  const coverageWitness = dependencies.passedCoverageWitnessReader
    ?? createDefaultPassedCoverageWitnessReader(env);
  const now = dependencies.now ?? Date.now;

  return async function handleBuildEventReceiptIngest(req: Request, res: Response) {
    headers(res);

    const producer = req.get('x-build-event-producer')?.trim() ?? '';
    const producerPolicy = BUILD_EVENT_PRODUCERS[producer];
    if (!producerPolicy) return res.status(401).json({ error: 'Unauthorized' });

    const slug = req.params.slug?.trim();
    if (!slug) return res.status(400).json({ error: 'project slug is required' });
    if (slug !== producerPolicy.projectSlug) {
      return res.status(403).json({ error: 'producer_project_not_allowed' });
    }

    const receiptRootToken = env.FCR_BUILD_EVENT_RECEIPT_ROOT_TOKEN?.trim();
    if (!receiptRootToken) {
      return res.status(503).json({ error: 'Build-event receipt ingest is not configured' });
    }

    // Keep remote-MCP invocation authority and build-observation authority on
    // different credentials. A client that legitimately knows the MCP bearer
    // must not be able to derive a producer receipt credential.
    const mcpToken = env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN?.trim();
    if (mcpToken && tokenMatches(receiptRootToken, mcpToken)) {
      return res.status(503).json({ error: 'Build-event receipt credential isolation is invalid' });
    }

    const expectedToken = deriveBuildEventReceiptToken(
      receiptRootToken,
      producer,
      producerPolicy.projectSlug,
    );
    if (!tokenMatches(req.get('x-build-event-receipt-token'), expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let event: BuildEvent;
    try {
      event = createBuildEvent(req.body as BuildEventInput);
    } catch {
      return res.status(400).json({ error: 'invalid_build_event' });
    }

    try {
      const project = await projectLookup(slug);
      if (!project) return res.status(404).json({ error: 'project not registered' });

      const receiptNow = now();
      const rejected = policyError(event, producerPolicy, project, receiptNow);
      if (rejected) return res.status(403).json({ error: rejected });

      if (event.coverage) {
        const witness = await coverageWitness.verify({
          project,
          event,
          maximumWitnessAgeSeconds: producerPolicy.coverage!.maximumWitnessAgeSeconds,
          providerWitness: producerPolicy.coverage!.providerWitness,
          nowMs: receiptNow,
        });
        if (witness.status !== 'verified') {
          return res.status(409).json({ accepted: false, error: witness.code });
        }
      }

      const disposition = await eventStore(project.id, event);
      if (disposition === 'conflict') {
        return res.status(409).json({ accepted: false, error: 'event_id_conflict', eventId: event.eventId });
      }

      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        eventId: event.eventId,
        contract: event.contract,
      });
    } catch {
      return res.status(503).json({ error: 'Build-event receipt verification or store unavailable' });
    }
  };
}

export const handleBuildEventReceiptIngest = createBuildEventReceiptIngestHandler();
