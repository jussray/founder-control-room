import { createHash } from 'node:crypto';
import { Router } from 'express';

import { supabase } from '../../lib/supabaseClient.js';
import {
  createFounderPermissionRequest,
  type FounderPermissionActionTarget,
} from '../../lib/founderPermissionBroker.js';
import { storedFounderPermissionDecisionMatches } from '../../lib/founderPermissionStoredDecision.js';
import {
  requireInteractiveFounder,
  type FounderRequest,
} from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';

const FCR_REPOSITORY = 'jussray/founder-control-room';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const RECEIPT_ID = /^far:[0-9a-f]{48}$/;
const REQUEST_SELECT = [
  'request_id',
  'requested_by_surface',
  'request_hash',
  'proposal',
  'action_target',
  'note',
  'status',
  'decision',
  'decision_hash',
  'decision_surface',
  'founder_user_id',
  'founder_email',
  'decided_at',
  'expires_at',
  'revoked_at',
  'consumed_at',
].join(',');
const RECEIPT_VERIFY_SELECT = [
  'receipt_id',
  'action_type',
  'repository',
  'pull_request_number',
  'base_sha',
  'head_sha',
  'environment',
  'status',
  'issued_at',
  'expires_at',
  'reserved_at',
].join(',');

type JsonRecord = Record<string, unknown>;

type CanonicalAction =
  | {
      actionType: 'merge';
      repository: string;
      pullRequestNumber: number;
      baseSha: string;
      headSha: string;
      environment: null;
    }
  | {
      actionType: 'deploy';
      repository: string;
      pullRequestNumber: null;
      baseSha: null;
      headSha: string;
      environment: 'production';
    };

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function founderOriginPresent(req: FounderRequest): boolean {
  return Boolean(req.get('Origin'));
}

function actionTargetFrom(value: unknown): FounderPermissionActionTarget {
  if (value == null) return null;
  if (!isRecord(value) || text(value.type) !== 'merge') return null;
  return {
    type: 'merge',
    repo: text(value.repo),
    pullRequestNumber: Number(value.pullRequestNumber),
    baseSha: text(value.baseSha),
    headSha: text(value.headSha),
  };
}

function canonicalActionFrom(row: JsonRecord): CanonicalAction {
  if (!isRecord(row.proposal)) throw new Error('Stored permission proposal is malformed.');
  const proposal = row.proposal;
  const actionType = text(proposal.actionType).toLowerCase();

  if (actionType === 'merge') {
    const target = actionTargetFrom(row.action_target);
    if (!target || target.type !== 'merge') {
      throw new Error('Merge authority requires an exact stored merge action target.');
    }
    const repository = target.repo.toLowerCase();
    const baseSha = target.baseSha.toLowerCase();
    const headSha = target.headSha.toLowerCase();
    if (repository !== FCR_REPOSITORY) throw new Error('Authority receipt repository is not Founder Control Room.');
    if (!Number.isInteger(target.pullRequestNumber) || target.pullRequestNumber <= 0) {
      throw new Error('Merge authority requires a positive pull request number.');
    }
    if (!FULL_SHA.test(baseSha) || !FULL_SHA.test(headSha)) {
      throw new Error('Merge authority requires exact base and head SHAs.');
    }
    if (text(proposal.expectedHeadSha).toLowerCase() !== headSha) {
      throw new Error('Stored merge proposal does not bind the exact target head.');
    }
    return {
      actionType: 'merge',
      repository,
      pullRequestNumber: target.pullRequestNumber,
      baseSha,
      headSha,
      environment: null,
    };
  }

  if (actionType === 'deploy') {
    const projectSlug = text(proposal.projectSlug).toLowerCase();
    const headSha = text(proposal.expectedHeadSha).toLowerCase();
    if (projectSlug !== 'founder-control-room') {
      throw new Error('Production deploy authority is limited to founder-control-room.');
    }
    if (!FULL_SHA.test(headSha)) throw new Error('Production deploy authority requires an exact main SHA.');
    if (row.action_target != null) throw new Error('Deploy authority must not carry a merge action target.');
    return {
      actionType: 'deploy',
      repository: FCR_REPOSITORY,
      pullRequestNumber: null,
      baseSha: null,
      headSha,
      environment: 'production',
    };
  }

  throw new Error(`Unsupported founder authority action: ${actionType || '<missing>'}.`);
}

function canonicalReceiptHash(input: {
  permissionRequestId: string;
  requestHash: string;
  decisionHash: string;
  action: CanonicalAction;
  founderUserId: string;
  founderEmail: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return createHash('sha256').update(JSON.stringify({
    contract: 'fcr/founder-action-authority@v1',
    permissionRequestId: input.permissionRequestId,
    requestHash: input.requestHash,
    decisionHash: input.decisionHash,
    action: input.action,
    founderUserId: input.founderUserId,
    founderEmail: input.founderEmail.toLowerCase(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  }), 'utf8').digest('hex');
}

export const founderAuthorityReceiptsRouter = Router();

// Public, read-only exact-scope verification for repository/provider gates.
// The caller must already know the complete action identity; founder identity,
// decision hashes, and broker metadata are never returned here.
founderAuthorityReceiptsRouter.get(
  '/verify',
  rateLimitFounderPermissions,
  async (req, res) => {
    const receiptId = text(req.query.receiptId);
    const actionType = text(req.query.actionType).toLowerCase();
    const repository = text(req.query.repository).toLowerCase();
    const headSha = text(req.query.headSha).toLowerCase();
    const pullRequestNumber = Number(req.query.pullRequestNumber);
    const baseSha = text(req.query.baseSha).toLowerCase();
    const environment = text(req.query.environment).toLowerCase();

    if (!['merge', 'deploy'].includes(actionType)
      || repository !== FCR_REPOSITORY
      || !FULL_SHA.test(headSha)
      || (receiptId && !RECEIPT_ID.test(receiptId))) {
      return res.status(400).json({ valid: false, code: 'FOUNDER_AUTHORITY_VERIFY_INPUT_INVALID' });
    }
    if (actionType === 'merge'
      && (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0 || !FULL_SHA.test(baseSha))) {
      return res.status(400).json({ valid: false, code: 'FOUNDER_AUTHORITY_VERIFY_INPUT_INVALID' });
    }
    if (actionType === 'deploy' && environment !== 'production') {
      return res.status(400).json({ valid: false, code: 'FOUNDER_AUTHORITY_VERIFY_INPUT_INVALID' });
    }

    let query = supabase
      .from('founder_authority_receipts')
      .select(RECEIPT_VERIFY_SELECT)
      .eq('action_type', actionType)
      .eq('repository', repository)
      .eq('head_sha', headSha)
      .in('status', ['active', 'reserved'])
      .is('consumed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('issued_at', { ascending: false })
      .limit(2);

    if (receiptId) query = query.eq('receipt_id', receiptId);
    if (actionType === 'merge') {
      query = query
        .eq('pull_request_number', pullRequestNumber)
        .eq('base_sha', baseSha)
        .is('environment', null);
    } else {
      query = query
        .is('pull_request_number', null)
        .is('base_sha', null)
        .eq('environment', 'production');
    }

    const { data, error } = await query;
    if (error) {
      return res.status(503).json({ valid: false, code: 'FOUNDER_AUTHORITY_STORE_UNAVAILABLE' });
    }
    const rows = (data ?? []) as JsonRecord[];
    if (rows.length === 0) {
      return res.json({ valid: false, code: 'FOUNDER_AUTHORITY_RECEIPT_NOT_FOUND' });
    }

    const row = rows[0]!;
    return res.json({
      valid: true,
      executionAuthorized: true,
      receipt: {
        receiptId: text(row.receipt_id),
        actionType: text(row.action_type),
        repository: text(row.repository),
        pullRequestNumber: row.pull_request_number == null ? null : Number(row.pull_request_number),
        baseSha: row.base_sha == null ? null : text(row.base_sha),
        headSha: text(row.head_sha),
        environment: row.environment == null ? null : text(row.environment),
        status: text(row.status),
        issuedAt: text(row.issued_at),
        expiresAt: text(row.expires_at),
        reservedAt: row.reserved_at == null ? null : text(row.reserved_at),
      },
    });
  },
);

founderAuthorityReceiptsRouter.post(
  '/:requestId/issue',
  rateLimitFounderPermissions,
  requireInteractiveFounder,
  async (req: FounderRequest, res) => {
    if (!founderOriginPresent(req)) {
      return res.status(403).json({
        error: 'An approved browser Origin and interactive founder session are required to issue execution authority.',
        code: 'FOUNDER_INTERACTIVE_AUTHORITY_REQUIRED',
      });
    }

    const requestId = text(req.params.requestId);
    if (!requestId) return res.status(400).json({ error: 'requestId is required.' });

    const { data, error } = await supabase
      .from('founder_permission_requests')
      .select(REQUEST_SELECT)
      .eq('request_id', requestId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Unable to read founder permission decision.' });
    if (!data) return res.status(404).json({ error: 'Founder permission request not found.' });

    const row = data as JsonRecord;
    const expiresAt = text(row.expires_at);
    const decidedAt = text(row.decided_at);
    const requestHash = text(row.request_hash).toLowerCase();
    const decisionHash = text(row.decision_hash).toLowerCase();
    const founderUserId = text(row.founder_user_id);
    const founderEmail = text(row.founder_email).toLowerCase();

    if (text(row.status) !== 'approved'
      || text(row.decision_surface) !== 'fcr'
      || !decidedAt
      || !expiresAt
      || Date.parse(expiresAt) <= Date.now()
      || row.revoked_at != null
      || row.consumed_at != null) {
      return res.status(409).json({
        error: 'Founder permission is not a fresh, unconsumed explicit FCR decision.',
        code: 'FOUNDER_PERMISSION_NOT_ISSUABLE',
      });
    }
    if (founderUserId !== req.founder!.userId || founderEmail !== req.founder!.email.toLowerCase()) {
      return res.status(403).json({
        error: 'Current founder identity does not match the stored decision identity.',
        code: 'FOUNDER_PERMISSION_IDENTITY_MISMATCH',
      });
    }
    if (!isRecord(row.proposal)) {
      return res.status(409).json({ error: 'Stored permission proposal is malformed.' });
    }

    const requestedBySurface = text(row.requested_by_surface) as 'fcr' | 'chatgpt' | 'claude' | 'perplexity';
    let permissionRequest;
    try {
      permissionRequest = createFounderPermissionRequest({
        requestId,
        requestedBySurface,
        proposal: {
          proposalId: text(row.proposal.proposalId),
          proposalHash: text(row.proposal.proposalHash),
          projectSlug: text(row.proposal.projectSlug),
          actionType: text(row.proposal.actionType),
          expectedHeadSha: text(row.proposal.expectedHeadSha) || null,
          capabilityPlanHash: text(row.proposal.capabilityPlanHash) || null,
        },
        actionTarget: actionTargetFrom(row.action_target),
        note: text(row.note) || null,
      });
    } catch (requestError) {
      return res.status(409).json({
        error: requestError instanceof Error ? requestError.message : String(requestError),
        code: 'FOUNDER_PERMISSION_STORED_SCOPE_INVALID',
      });
    }

    if (permissionRequest.requestHash !== requestHash
      || !storedFounderPermissionDecisionMatches(permissionRequest, {
        status: row.status,
        decision: row.decision,
        decisionHash: row.decision_hash,
        decisionSurface: row.decision_surface,
      })) {
      return res.status(409).json({
        error: 'Stored founder decision no longer matches its canonical request identity.',
        code: 'FOUNDER_PERMISSION_DECISION_MISMATCH',
      });
    }

    let action: CanonicalAction;
    try {
      action = canonicalActionFrom(row);
    } catch (actionError) {
      return res.status(409).json({
        error: actionError instanceof Error ? actionError.message : String(actionError),
        code: 'FOUNDER_AUTHORITY_SCOPE_INVALID',
      });
    }

    const receiptHash = canonicalReceiptHash({
      permissionRequestId: requestId,
      requestHash,
      decisionHash,
      action,
      founderUserId,
      founderEmail,
      issuedAt: decidedAt,
      expiresAt,
    });
    const receiptId = `far:${receiptHash.slice(0, 48)}`;
    if (!RECEIPT_ID.test(receiptId)) throw new Error('Generated authority receipt id is invalid.');

    const rowToInsert = {
      receipt_id: receiptId,
      permission_request_id: requestId,
      request_hash: requestHash,
      decision_hash: decisionHash,
      receipt_hash: receiptHash,
      action_type: action.actionType,
      repository: action.repository,
      pull_request_number: action.pullRequestNumber,
      base_sha: action.baseSha,
      head_sha: action.headSha,
      environment: action.environment,
      founder_user_id: founderUserId,
      founder_email: founderEmail,
      status: 'active',
      issued_at: decidedAt,
      expires_at: expiresAt,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('founder_authority_receipts')
      .insert(rowToInsert)
      .select('*')
      .maybeSingle();

    if (insertError || !inserted) {
      const { data: existing, error: existingError } = await supabase
        .from('founder_authority_receipts')
        .select('*')
        .eq('receipt_id', receiptId)
        .maybeSingle();
      if (existingError || !existing) {
        return res.status(500).json({ error: 'Unable to persist canonical founder authority receipt.' });
      }
      if (text(existing.receipt_hash) !== receiptHash
        || text(existing.permission_request_id) !== requestId
        || text(existing.action_type) !== action.actionType
        || text(existing.head_sha).toLowerCase() !== action.headSha.toLowerCase()) {
        return res.status(409).json({
          error: 'Authority receipt identity is already bound to different execution scope.',
          code: 'FOUNDER_AUTHORITY_RECEIPT_CONFLICT',
        });
      }
      return res.json({
        idempotent: true,
        executionAuthorized: true,
        receipt: existing,
      });
    }

    return res.status(201).json({
      idempotent: false,
      executionAuthorized: true,
      receipt: inserted,
    });
  },
);
