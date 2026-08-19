import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { createBuildEvent, type BuildEvent, type BuildEventInput } from '../../buildEvents/buildEvent.js';
import type { BuildEventStoreDisposition } from '../../services/buildEventStore.js';

const TOKEN_CONTEXT = 'founder-control-room/build-event-receipts/v1';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export interface BuildEventProducerPolicy {
  repository: string;
  sources: readonly BuildEventInput['source'][];
  categories: readonly BuildEventInput['category'][];
}

export const BUILD_EVENT_PRODUCERS: Readonly<Record<string, BuildEventProducerPolicy>> = {
  'sekret-bip-release-observer': {
    repository: 'jussray/Sekret-Bip',
    sources: ['cloudflare', 'playwright', 'supabase'],
    categories: ['runtime', 'verification', 'artifact'],
  },
};

interface ProjectRecord {
  id: string;
  slug: string;
  repoIdentifier: string | null;
}

export interface BuildEventReceiptDependencies {
  env?: NodeJS.ProcessEnv;
  findProject?: (slug: string) => Promise<ProjectRecord | null>;
  storeEvent?: (projectId: string, event: BuildEvent) => Promise<BuildEventStoreDisposition>;
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

export function deriveBuildEventReceiptToken(rootToken: string, producer: string): string {
  return createHmac('sha256', rootToken)
    .update(`${TOKEN_CONTEXT}:${producer}`)
    .digest('hex');
}

async function findProject(slug: string): Promise<ProjectRecord | null> {
  const { supabase } = await import('../../lib/supabaseClient.js');
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, repo_identifier')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error('project_lookup_failed');
  if (!data) return null;
  return {
    id: String(data.id),
    slug: String(data.slug),
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
  if (!producerPolicy.sources.includes(event.source)) return 'producer_source_not_allowed';
  if (!producerPolicy.categories.includes(event.category)) return 'producer_category_not_allowed';
  if (project.repoIdentifier !== producerPolicy.repository) return 'producer_project_mismatch';
  if (event.repository?.name !== producerPolicy.repository) return 'event_repository_mismatch';
  if (!event.repository?.commitSha) return 'exact_commit_sha_required';
  if (event.repository.branch !== 'main' || event.repository.refKind !== 'branch-head') {
    return 'production_receipt_requires_main_branch_head';
  }

  const occurredAtMs = Date.parse(event.occurredAt);
  if (occurredAtMs > nowMs + MAX_FUTURE_SKEW_MS) return 'event_occurred_at_too_far_in_future';
  if (occurredAtMs < nowMs - MAX_EVENT_AGE_MS) return 'event_receipt_expired';

  if (event.category === 'runtime') {
    if (!event.runtime?.releaseSha) return 'runtime_release_sha_required';
    if (event.runtime.releaseSha !== event.repository.commitSha) return 'runtime_release_sha_mismatch';
  }
  if (event.category === 'verification') {
    if (!event.verification?.exactCommitSha) return 'verification_exact_sha_required';
    if (event.verification.exactCommitSha !== event.repository.commitSha) {
      return 'verification_exact_sha_mismatch';
    }
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
  const now = dependencies.now ?? Date.now;

  return async function handleBuildEventReceiptIngest(req: Request, res: Response) {
    headers(res);

    const producer = req.get('x-build-event-producer')?.trim() ?? '';
    const producerPolicy = BUILD_EVENT_PRODUCERS[producer];
    if (!producerPolicy) return res.status(401).json({ error: 'Unauthorized' });

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

    const expectedToken = deriveBuildEventReceiptToken(receiptRootToken, producer);
    if (!tokenMatches(req.get('x-build-event-receipt-token'), expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const slug = req.params.slug?.trim();
    if (!slug) return res.status(400).json({ error: 'project slug is required' });

    let event: BuildEvent;
    try {
      event = createBuildEvent(req.body as BuildEventInput);
    } catch {
      return res.status(400).json({ error: 'invalid_build_event' });
    }

    try {
      const project = await projectLookup(slug);
      if (!project) return res.status(404).json({ error: 'project not registered' });

      const rejected = policyError(event, producerPolicy, project, now());
      if (rejected) return res.status(403).json({ error: rejected });

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
      return res.status(503).json({ error: 'Build-event receipt store unavailable' });
    }
  };
}

export const handleBuildEventReceiptIngest = createBuildEventReceiptIngestHandler();
