/**
 * PortfolioLedgerProjectionController
 *
 * Observation-only projection of signature-verified GitHub merge events into a
 * human-readable portfolio ledger. GitHub/FCR remain authority; the external
 * ledger is a replaceable projection surface and can never authorize actions.
 */

import { supabase } from '../lib/supabaseClient.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import { BaseController } from './base.js';

export const PORTFOLIO_LEDGER_PROJECTION_CONTRACT = 'fcr/portfolio-ledger-projection@v1' as const;
export const PORTFOLIO_LEDGER_RECEIPT_CONTRACT = 'fcr/portfolio-ledger-write-receipt@v1' as const;

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@]/;
const MAX_RESPONSE_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

interface MergeObservation {
  projectId: string;
  sourceEventId: string;
  repository: string;
  pullRequestNumber: number;
  title: string;
  targetBranch: string;
  mergeCommitSha: string;
  reviewedHeadSha: string;
  updatedAt: string;
}

export interface PortfolioLedgerProjection {
  contract: typeof PORTFOLIO_LEDGER_PROJECTION_CONTRACT;
  projectionId: string;
  idempotencyKey: string;
  authority: 'observed';
  authorizing: false;
  source: {
    provider: 'github';
    sourceEventId: string;
    repository: string;
    pullRequestNumber: number;
    reviewedHeadSha: string;
    mergeCommitSha: string;
    targetBranch: string;
  };
  target: {
    provider: 'google-sheets';
    workbook: 'ULTRATHINK Portfolio Proof Orientation Ledger';
    tab: 'Orientation Ledger';
    mode: 'upsert';
    valueInputOption: 'RAW';
    rowKey: string;
  };
  row: {
    workstream: 'GitHub Merge Truth';
    projectScope: string;
    classification: 'VERIFIED';
    proofGate: string;
    dependencyTrigger: string;
    currentReality: string;
    action: string;
    evidenceRequired: string;
    ownerDecision: 'Founder / FCR';
    nextGate: string;
    lastUpdated: string;
    continuityCookie: string;
  };
  continuity: {
    browserCookie: false;
    authorizing: false;
    approvalCarryForward: false;
    standingMutationAuthority: false;
  };
}

interface PortfolioLedgerWriteReceipt {
  contract: typeof PORTFOLIO_LEDGER_RECEIPT_CONTRACT;
  projectionId: string;
  provider: 'google-sheets';
  status: 'written' | 'unchanged';
  receiptId: string;
  range?: string;
}

function bounded(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARACTERS, ' ').trim().slice(0, max)
    : '';
}

function sheetSafe(value: string): string {
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function exactSha(value: unknown): string | null {
  const candidate = bounded(value, 40).toLowerCase();
  return EXACT_SHA.test(candidate) ? candidate : null;
}

function validTimestamp(value: unknown): string | null {
  const candidate = bounded(value, 64);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function projectionId(repository: string, mergeCommitSha: string): string {
  return `github-merge:${repository.toLowerCase()}:${mergeCommitSha}`;
}

export function buildPortfolioLedgerProjection(observation: MergeObservation): PortfolioLedgerProjection {
  const id = projectionId(observation.repository, observation.mergeCommitSha);
  const safeTitle = sheetSafe(observation.title || `PR #${observation.pullRequestNumber}`);
  return {
    contract: PORTFOLIO_LEDGER_PROJECTION_CONTRACT,
    projectionId: id,
    idempotencyKey: id,
    authority: 'observed',
    authorizing: false,
    source: {
      provider: 'github',
      sourceEventId: observation.sourceEventId,
      repository: observation.repository,
      pullRequestNumber: observation.pullRequestNumber,
      reviewedHeadSha: observation.reviewedHeadSha,
      mergeCommitSha: observation.mergeCommitSha,
      targetBranch: observation.targetBranch,
    },
    target: {
      provider: 'google-sheets',
      workbook: 'ULTRATHINK Portfolio Proof Orientation Ledger',
      tab: 'Orientation Ledger',
      mode: 'upsert',
      valueInputOption: 'RAW',
      rowKey: `github:${observation.repository.toLowerCase()}`,
    },
    row: {
      workstream: 'GitHub Merge Truth',
      projectScope: observation.repository,
      classification: 'VERIFIED',
      proofGate: 'Source merge observed; runtime and deployment proof remain separate gates.',
      dependencyTrigger: `PR #${observation.pullRequestNumber} merged into ${observation.targetBranch}`,
      currentReality: `${safeTitle} landed at ${observation.mergeCommitSha}.`,
      action: 'Reacquire exact-main machine, provider, and runtime proof before promoting runtime truth.',
      evidenceRequired: 'Signature-verified GitHub merge receipt plus exact landed SHA; runtime evidence remains separate.',
      ownerDecision: 'Founder / FCR',
      nextGate: 'Exact-main verification and runtime witness.',
      lastUpdated: observation.updatedAt,
      continuityCookie: [
        'GITHUB-MERGE',
        `repo:${observation.repository}`,
        `pr:${observation.pullRequestNumber}`,
        `reviewed:${observation.reviewedHeadSha}`,
        `landed:${observation.mergeCommitSha}`,
        'authority:observed',
      ].join('|'),
    },
    continuity: {
      browserCookie: false,
      authorizing: false,
      approvalCarryForward: false,
      standingMutationAuthority: false,
    },
  };
}

function parseMergeObservation(
  projectId: string,
  sourceEventId: string,
  event: { event_type?: unknown; payload?: unknown },
): MergeObservation | null {
  if (event.event_type !== 'pull_request' || !event.payload || typeof event.payload !== 'object') return null;
  const payload = event.payload as Record<string, unknown>;
  const repositoryValue = payload.repository && typeof payload.repository === 'object'
    ? (payload.repository as Record<string, unknown>).full_name
    : undefined;
  const pullRequest = payload.pull_request && typeof payload.pull_request === 'object'
    ? payload.pull_request as Record<string, unknown>
    : null;
  if (!pullRequest || pullRequest.merged !== true) return null;

  const repository = bounded(repositoryValue, 200);
  const number = pullRequest.number;
  const title = bounded(pullRequest.title, 256);
  const mergeCommitSha = exactSha(pullRequest.merge_commit_sha);
  const updatedAt = validTimestamp(pullRequest.updated_at);
  const head = pullRequest.head && typeof pullRequest.head === 'object'
    ? pullRequest.head as Record<string, unknown>
    : null;
  const base = pullRequest.base && typeof pullRequest.base === 'object'
    ? pullRequest.base as Record<string, unknown>
    : null;
  const reviewedHeadSha = exactSha(head?.sha);
  const targetBranch = bounded(base?.ref, 255);

  if (
    !REPOSITORY.test(repository)
    || typeof number !== 'number'
    || !Number.isSafeInteger(number)
    || number <= 0
    || !mergeCommitSha
    || !reviewedHeadSha
    || !targetBranch
    || !updatedAt
  ) {
    return null;
  }

  return {
    projectId,
    sourceEventId,
    repository,
    pullRequestNumber: number,
    title,
    targetBranch,
    mergeCommitSha,
    reviewedHeadSha,
    updatedAt,
  };
}

function configuredAdapter(env: NodeJS.ProcessEnv): { url: string; token: string } | null {
  const rawUrl = bounded(env.PORTFOLIO_LEDGER_PROJECTION_URL, 2_048);
  const token = bounded(env.PORTFOLIO_LEDGER_PROJECTION_TOKEN, 4_096);
  if (!rawUrl || !token) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { url: url.toString(), token };
  } catch {
    return null;
  }
}

async function postProjection(
  projection: PortfolioLedgerProjection,
  adapter: { url: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<PortfolioLedgerWriteReceipt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(adapter.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${adapter.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': projection.idempotencyKey,
      },
      body: JSON.stringify(projection),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error('portfolio ledger adapter response exceeded the bounded receipt size');
    }
    if (!response.ok) throw new Error(`portfolio ledger adapter returned HTTP ${response.status}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('portfolio ledger adapter returned non-JSON receipt');
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('portfolio ledger adapter receipt is invalid');
    const receipt = parsed as Record<string, unknown>;
    const receiptId = bounded(receipt.receiptId, 300);
    const range = bounded(receipt.range, 300);
    if (
      receipt.contract !== PORTFOLIO_LEDGER_RECEIPT_CONTRACT
      || receipt.projectionId !== projection.projectionId
      || receipt.provider !== 'google-sheets'
      || (receipt.status !== 'written' && receipt.status !== 'unchanged')
      || !receiptId
    ) {
      throw new Error('portfolio ledger adapter receipt does not match the requested projection');
    }
    return {
      contract: PORTFOLIO_LEDGER_RECEIPT_CONTRACT,
      projectionId: projection.projectionId,
      provider: 'google-sheets',
      status: receipt.status,
      receiptId,
      ...(range ? { range } : {}),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class PortfolioLedgerProjectionController extends BaseController {
  readonly name = 'PortfolioLedgerProjectionController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, sourceEventId } = req;
    if (!sourceEventId) return this.done('blocked', 'Portfolio ledger projection requires an observed provider event');

    const { data: event, error: eventError } = await supabase
      .from('provider_events')
      .select('payload, event_type')
      .eq('id', sourceEventId)
      .single();
    if (eventError || !event) {
      return this.done('retry', eventError?.message ?? `Provider event ${sourceEventId} not found`);
    }

    const observation = parseMergeObservation(projectId, sourceEventId, event);
    if (!observation) {
      return this.done('blocked', 'Provider event is not a complete signature-verified merged pull-request observation');
    }

    const projection = buildPortfolioLedgerProjection(observation);
    const subject = `portfolio-ledger:${observation.repository.toLowerCase()}:${observation.mergeCommitSha}`;
    const { data: prior, error: priorError } = await supabase
      .from('evidence')
      .select('id, details_ref')
      .eq('project_id', projectId)
      .eq('subject', subject)
      .eq('kind', 'artifact_provenance')
      .eq('status', 'pass')
      .eq('provider', 'control-room')
      .eq('commit_sha', observation.mergeCommitSha)
      .limit(1)
      .maybeSingle();
    if (priorError) return this.done('retry', priorError.message);
    if (prior?.id) {
      return {
        status: 'converged',
        observedChanges: [],
        proposedActions: [],
        evidenceIds: [String(prior.id)],
        requiresApproval: false,
        message: `Portfolio ledger projection already has a durable receipt for ${projection.projectionId}`,
      };
    }

    const adapter = configuredAdapter(process.env);
    if (!adapter) {
      return this.done(
        'blocked',
        'Portfolio ledger adapter is not configured; GitHub merge truth remains durable in FCR and has not been projected to Google Sheets',
      );
    }

    let receipt: PortfolioLedgerWriteReceipt;
    try {
      receipt = await postProjection(projection, adapter);
    } catch (error) {
      return this.done('retry', error instanceof Error ? error.message : String(error));
    }

    const { data: inserted, error: insertError } = await supabase
      .from('evidence')
      .insert({
        project_id: projectId,
        mission_id: null,
        subject,
        kind: 'artifact_provenance',
        status: 'pass',
        provider: 'control-room',
        commit_sha: observation.mergeCommitSha,
        environment: 'portfolio-ledger',
        details_ref: `google-sheets:${receipt.receiptId}${receipt.range ? `:${receipt.range}` : ''}`,
      })
      .select('id')
      .single();
    if (insertError || !inserted?.id) {
      return this.done('retry', insertError?.message ?? 'Portfolio ledger write receipt could not be persisted');
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'portfolio-ledger-projection',
        resourceId: projection.projectionId,
        field: 'status',
        previousValue: null,
        newValue: receipt.status,
      }],
      proposedActions: [],
      evidenceIds: [String(inserted.id)],
      requiresApproval: false,
      message: `Google Sheets portfolio ledger ${receipt.status} for ${projection.projectionId}`,
    };
  }

  private done(status: ReconcileResult['status'], message: string): ReconcileResult {
    return {
      status,
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message,
      ...(status === 'retry' ? { retryAfter: new Date(Date.now() + 10_000).toISOString() } : {}),
    };
  }
}
