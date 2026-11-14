import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  validateActionCostReceipt,
  type ActionCostReceiptV1,
} from '../../economics/actionCostLedger.js';

const TOKEN_CONTEXT = 'founder-control-room/action-cost-receipts/v1';
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export interface ActionCostProducerPolicy {
  projectSlug: string;
  repository: string;
  repositoryProvider: 'github';
}

export const ACTION_COST_PRODUCERS: Readonly<Record<string, ActionCostProducerPolicy>> = {
  'founder-control-room': {
    projectSlug: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    repositoryProvider: 'github',
  },
  'chief-ai-machine': {
    projectSlug: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    repositoryProvider: 'github',
  },
  promptos: {
    projectSlug: 'promptos',
    repository: 'jussray/promptos',
    repositoryProvider: 'github',
  },
  solcontinuity: {
    projectSlug: 'solcontinuity',
    repository: 'jussray/solcontinuity',
    repositoryProvider: 'github',
  },
};

interface ProjectRecord {
  id: string;
  slug: string;
  repoProvider: string | null;
  repoIdentifier: string | null;
}

export type ActionCostStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface ActionCostReceiptDependencies {
  env?: NodeJS.ProcessEnv;
  findProject?: (slug: string) => Promise<ProjectRecord | null>;
  storeReceipt?: (projectId: string, receipt: ActionCostReceiptV1) => Promise<ActionCostStoreDisposition>;
  now?: () => number;
}

function responseHeaders(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function deriveActionCostReceiptToken(
  rootToken: string,
  producer: string,
  projectSlug: string,
): string {
  const target = projectSlug.trim();
  if (!target) throw new Error('action-cost receipt project binding is required');
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

function eventSeverity(receipt: ActionCostReceiptV1): 'info' | 'warning' | 'error' {
  if (receipt.budgetState === 'exceeded') return 'error';
  if (receipt.budgetState === 'warning' || receipt.actionClassState === 'exceeded') return 'warning';
  return 'info';
}

/** A reused receipt ID is idempotent only when the persisted identity is identical. */
export function classifyActionCostReplay(
  stored: unknown,
  receipt: ActionCostReceiptV1,
): 'duplicate' | 'conflict' {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return 'conflict';
  const row = stored as Record<string, unknown>;
  const metadata = row.metadata;
  if (row.event_type !== 'action_cost_receipt'
    || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'conflict';
  const prior = metadata as Record<string, unknown>;
  return prior.contract === receipt.contract
    && prior.receiptId === receipt.receiptId
    && prior.receiptHash === receipt.receiptHash
    ? 'duplicate' : 'conflict';
}

async function storeReceipt(
  projectId: string,
  receipt: ActionCostReceiptV1,
): Promise<ActionCostStoreDisposition> {
  const { supabase } = await import('../../lib/supabaseClient.js');
  const usage = receipt.usage ?? null;
  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: `action-cost:${receipt.receiptId}`,
    event_type: 'action_cost_receipt',
    severity: eventSeverity(receipt),
    screen: 'action-cost-ledger',
    provider: usage?.provider ?? null,
    model: usage?.model ?? null,
    decision: receipt.budgetState,
    metadata: {
      contract: receipt.contract,
      receiptId: receipt.receiptId,
      receiptHash: receipt.receiptHash,
      actionId: receipt.actionId,
      actionClass: receipt.actionClass,
      actionClassMaxUsd: receipt.actionClassMaxUsd,
      actionClassState: receipt.actionClassState,
      occurredAt: receipt.occurredAt,
      pricingVersion: receipt.pricingVersion,
      planId: receipt.planId,
      billingSubjectRef: receipt.billingSubjectRef ?? null,
      sourceRef: receipt.sourceRef ?? null,
      costBasis: receipt.costBasis,
      costTruth: receipt.costTruth,
      actualCostUsd: receipt.actualCostUsd,
      actionUnits: receipt.actionUnits,
      monthRuntimeCostBeforeUsd: receipt.monthRuntimeCostBeforeUsd,
      monthRuntimeCostAfterUsd: receipt.monthRuntimeCostAfterUsd,
      monthlyRuntimeBudgetUsd: receipt.monthlyRuntimeBudgetUsd,
      budgetRemainingUsd: receipt.budgetRemainingUsd,
      budgetUtilizationPct: receipt.budgetUtilizationPct,
      budgetState: receipt.budgetState,
      planNetRevenueUsd: receipt.planNetRevenueUsd ?? null,
      runtimeContributionMarginPct: receipt.runtimeContributionMarginPct,
      usage: usage
        ? {
            inputTokens: usage.inputTokens ?? null,
            outputTokens: usage.outputTokens ?? null,
            toolCalls: usage.toolCalls ?? null,
            tools: usage.tools ?? [],
          }
        : null,
    },
  });

  if (!error) return 'stored';
  if (!('code' in error) || error.code !== '23505') {
    throw new Error('action_cost_receipt_store_failed');
  }

  const { data: existing, error: lookupError } = await supabase
    .from('project_events')
    .select('event_type,metadata')
    .eq('project_id', projectId)
    .eq('source_event_id', `action-cost:${receipt.receiptId}`)
    .maybeSingle();

  if (lookupError) throw new Error('action_cost_receipt_duplicate_lookup_failed');
  return classifyActionCostReplay(existing, receipt);
}

function policyError(
  receipt: ActionCostReceiptV1,
  policy: ActionCostProducerPolicy,
  project: ProjectRecord,
  nowMs: number,
): string | null {
  if (receipt.projectSlug !== policy.projectSlug) return 'receipt_project_mismatch';
  if (project.slug !== policy.projectSlug) return 'producer_project_mismatch';
  if (project.repoIdentifier !== policy.repository) return 'producer_project_mismatch';
  if (project.repoProvider?.toLowerCase() !== policy.repositoryProvider) {
    return 'producer_repository_provider_mismatch';
  }
  if (Date.parse(receipt.occurredAt) > nowMs + MAX_FUTURE_SKEW_MS) {
    return 'receipt_occurred_at_too_far_in_future';
  }
  return null;
}

export function createActionCostReceiptIngestHandler(
  dependencies: ActionCostReceiptDependencies = {},
): RequestHandler {
  const env = dependencies.env ?? process.env;
  const projectLookup = dependencies.findProject ?? findProject;
  const receiptStore = dependencies.storeReceipt ?? storeReceipt;
  const now = dependencies.now ?? Date.now;

  return async function handleActionCostReceiptIngest(req: Request, res: Response) {
    responseHeaders(res);

    const producer = req.get('x-action-cost-producer')?.trim() ?? '';
    const producerPolicy = ACTION_COST_PRODUCERS[producer];
    if (!producerPolicy) return res.status(401).json({ error: 'Unauthorized' });

    const slug = req.params.slug?.trim() ?? '';
    if (!slug) return res.status(400).json({ error: 'project slug is required' });
    if (slug !== producerPolicy.projectSlug) {
      return res.status(403).json({ error: 'producer_project_not_allowed' });
    }

    const rootToken = env.FCR_ACTION_COST_RECEIPT_ROOT_TOKEN?.trim();
    if (!rootToken) return res.status(503).json({ error: 'Action-cost receipt ingest is not configured' });

    const expectedToken = deriveActionCostReceiptToken(rootToken, producer, producerPolicy.projectSlug);
    if (!tokenMatches(req.get('x-action-cost-receipt-token'), expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const receipt = req.body as ActionCostReceiptV1;
    const validationErrors = validateActionCostReceipt(receipt);
    if (validationErrors.length) {
      return res.status(400).json({ error: 'invalid_action_cost_receipt', details: validationErrors });
    }

    try {
      const project = await projectLookup(slug);
      if (!project) return res.status(404).json({ error: 'project not registered' });

      const rejected = policyError(receipt, producerPolicy, project, now());
      if (rejected) return res.status(403).json({ error: rejected });

      const disposition = await receiptStore(project.id, receipt);
      if (disposition === 'conflict') {
        return res.status(409).json({ error: 'action_cost_receipt_conflict', receiptId: receipt.receiptId });
      }
      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        receiptId: receipt.receiptId,
        receiptHash: receipt.receiptHash,
        contract: receipt.contract,
        budgetState: receipt.budgetState,
        actionClassState: receipt.actionClassState,
      });
    } catch {
      return res.status(503).json({ error: 'Action-cost receipt verification or store unavailable' });
    }
  };
}

export const handleActionCostReceiptIngest = createActionCostReceiptIngestHandler();
