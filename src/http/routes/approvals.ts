/**
 * Approvals route — founder-gated action execution.
 *
 * Proof-gated actions require BOTH:
 *   1. a fresh founder-approved proof_gate_results record; and
 *   2. complete machine evidence bound to the exact current head SHA.
 *
 * Founder Control Room merges additionally require provider-backed exact-PR
 * review evidence. The canonical founder-final mode requires deterministic
 * independent review first, then an authenticated founder approval bound to
 * the exact PR/base/head before provider integration.
 *
 * Every external mutation is reserved in approval_executions BEFORE the
 * provider call. A pending reservation blocks replay if the provider succeeds
 * but the final audit update is interrupted.
 */

import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { supabase } from '../../lib/supabaseClient.js';
import { executionScopeMatches } from '../../lib/idempotencyScope.js';
import {
  providerConfigurationError,
  providerForProject,
  type ProviderProjectConfig,
} from '../../providers/providerFactory.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { ProofGateController } from '../../controllers/ProofGateController.js';
import type { ProofEvidence } from '../../proof-gate/index.js';
import type { EvidenceKind } from '../../reconciliation/types.js';
import { WEBHOOK_ONLY_EVIDENCE_KINDS } from '../../reconciliation/types.js';
import type { PatchFileChange, RepositoryProvider } from '../../providers/RepositoryProvider.js';
import {
  FCR_FOUNDER_FINAL_REVIEW_POLICY,
  evaluateIndependentReviewGate,
  independentReviewDiffHash,
  independentReviewPolicyHash,
  type IndependentReviewPolicy,
  type IndependentReviewReceipt,
} from '../../review/independentReviewGate.js';

/** Mission states in which the branch is still under active work — safe to patch. */
const PATCHABLE_MISSION_STATUSES = new Set(['sandboxed', 'in_review']);

/** Rejects absolute paths and `..` segments before they reach the provider. */
function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0')) return false;
  return !path.split('/').some((segment) => segment === '..' || segment === '');
}

const PROOF_GATED_ACTIONS = new Set(['merge', 'create_branch']);
const PROOF_GATE_TTL_MS = 15 * 60 * 1_000;
const FCR_REPOSITORY = 'jussray/founder-control-room';
const FOUNDER_FINAL_REVIEW_CONTRACT = 'juss-v10/founder-final-merge@v1' as const;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

interface ExecutionRecord {
  id: string;
  mission_id: string | null;
  project_id: string;
  action_type: string;
  status: 'pending' | 'succeeded' | 'failed';
  result: Record<string, unknown> | null;
  success: boolean | null;
}

interface RepositoryProjectRow {
  slug: string;
  repo_provider: string;
  repo_identifier: string | null;
}

interface FounderPinnedIndependentReview {
  pullRequestNumber: number;
  baseSha: string;
  authorIdentity: string;
  policy: IndependentReviewPolicy;
  policyHash: string;
}

interface FounderPinnedFinalReview {
  contract: typeof FOUNDER_FINAL_REVIEW_CONTRACT;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  founderIdentity: string;
  approvedAt: string;
}

export const approvalsRouter = Router();
approvalsRouter.use(requireFounder);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function isFounderControlRoomRepository(project: RepositoryProjectRow): boolean {
  return lower(project.repo_identifier) === FCR_REPOSITORY;
}

function validateIndependentReviewPolicy(
  value: unknown,
): { ok: true; policy: IndependentReviewPolicy } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'independentReview.policy must be an object' };
  }
  const candidate = value as Record<string, unknown>;
  const founderFinalApprovalRequired = candidate['founderFinalApprovalRequired'] === true;
  const requiredSemanticReviews = candidate['requiredSemanticReviews'];
  const minimumSemanticReviews = founderFinalApprovalRequired ? 0 : 1;
  if (!Number.isInteger(requiredSemanticReviews)
    || Number(requiredSemanticReviews) < minimumSemanticReviews
    || Number(requiredSemanticReviews) > 4) {
    return {
      ok: false,
      error: founderFinalApprovalRequired
        ? 'founder-final review policy requires requiredSemanticReviews from 0 to 4'
        : 'independentReview.policy.requiredSemanticReviews must be an integer from 1 to 4',
    };
  }
  if (candidate['requireDeterministicReview'] !== true) {
    return { ok: false, error: 'FCR independent review policy must require deterministic review' };
  }
  if (candidate['blockOnP2'] !== true) {
    return { ok: false, error: 'FCR independent review policy must keep P2 findings merge-blocking' };
  }
  const rawTrusted = candidate['trustedSemanticReviewerIds'];
  if (!Array.isArray(rawTrusted)
    || rawTrusted.some((reviewer) => !text(reviewer))
    || (!founderFinalApprovalRequired && rawTrusted.length === 0)) {
    return {
      ok: false,
      error: founderFinalApprovalRequired
        ? 'founder-final review policy trustedSemanticReviewerIds must be an array'
        : 'independentReview.policy.trustedSemanticReviewerIds must contain reviewer identities',
    };
  }
  const trustedSemanticReviewerIds = rawTrusted.map((reviewer) => text(reviewer));
  const normalized = trustedSemanticReviewerIds.map((reviewer) => reviewer.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, error: 'independentReview.policy.trustedSemanticReviewerIds must be unique' };
  }
  if (trustedSemanticReviewerIds.length < Number(requiredSemanticReviews)) {
    return { ok: false, error: 'independentReview policy has fewer trusted reviewers than required semantic reviews' };
  }

  return {
    ok: true,
    policy: {
      requiredSemanticReviews: Number(requiredSemanticReviews),
      requireDeterministicReview: true,
      blockOnP2: true,
      trustedSemanticReviewerIds,
      ...(founderFinalApprovalRequired ? { founderFinalApprovalRequired: true as const } : {}),
    },
  };
}

function validateIndependentReviewApproval(
  value: unknown,
): { ok: true; pullRequestNumber: number; policy: IndependentReviewPolicy } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'FCR merge approval requires independentReview metadata' };
  }
  const candidate = value as Record<string, unknown>;
  const pullRequestNumber = candidate['pullRequestNumber'];
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    return { ok: false, error: 'independentReview.pullRequestNumber must be a positive integer' };
  }
  const policyResult = validateIndependentReviewPolicy(candidate['policy']);
  if (!policyResult.ok) return policyResult;
  return {
    ok: true,
    pullRequestNumber: Number(pullRequestNumber),
    policy: policyResult.policy,
  };
}

function validateFounderFinalReviewApproval(
  value: unknown,
): { ok: true; pullRequestNumber: number } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'FCR founder-final merge approval requires founderFinalReview metadata' };
  }
  const candidate = value as Record<string, unknown>;
  const pullRequestNumber = candidate['pullRequestNumber'];
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    return { ok: false, error: 'founderFinalReview.pullRequestNumber must be a positive integer' };
  }
  if (candidate['confirmExactCandidate'] !== true) {
    return { ok: false, error: 'founderFinalReview.confirmExactCandidate must be true' };
  }
  if (candidate['policy'] !== undefined || candidate['trustedSemanticReviewerIds'] !== undefined) {
    return { ok: false, error: 'founder-final review policy is server-owned and cannot be redefined by the caller' };
  }
  return { ok: true, pullRequestNumber: Number(pullRequestNumber) };
}

function readPinnedIndependentReview(
  value: unknown,
): { ok: true; review: FounderPinnedIndependentReview } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Mission has no founder-pinned independent review policy' };
  }
  const candidate = value as Record<string, unknown>;
  const pullRequestNumber = candidate['pullRequestNumber'];
  const baseSha = lower(candidate['baseSha']);
  const authorIdentity = text(candidate['authorIdentity']);
  const policyHash = lower(candidate['policyHash']);
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    return { ok: false, error: 'Pinned independent review PR number is invalid' };
  }
  if (!FULL_SHA.test(baseSha)) return { ok: false, error: 'Pinned independent review base SHA is invalid' };
  if (!authorIdentity) return { ok: false, error: 'Pinned independent review author identity is missing' };
  if (!SHA256.test(policyHash)) return { ok: false, error: 'Pinned independent review policy hash is invalid' };
  const policyResult = validateIndependentReviewPolicy(candidate['policy']);
  if (!policyResult.ok) return policyResult;
  return {
    ok: true,
    review: {
      pullRequestNumber: Number(pullRequestNumber),
      baseSha,
      authorIdentity,
      policy: policyResult.policy,
      policyHash,
    },
  };
}

function readPinnedFounderFinalReview(
  value: unknown,
): { ok: true; review: FounderPinnedFinalReview } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Mission has no founder-final review receipt' };
  }
  const candidate = value as Record<string, unknown>;
  const contract = candidate['contract'];
  const pullRequestNumber = candidate['pullRequestNumber'];
  const baseSha = lower(candidate['baseSha']);
  const headSha = lower(candidate['headSha']);
  const founderIdentity = text(candidate['founderIdentity']);
  const approvedAt = text(candidate['approvedAt']);
  if (contract !== FOUNDER_FINAL_REVIEW_CONTRACT) return { ok: false, error: 'Founder-final review contract is invalid' };
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    return { ok: false, error: 'Founder-final review PR number is invalid' };
  }
  if (!FULL_SHA.test(baseSha) || !FULL_SHA.test(headSha)) {
    return { ok: false, error: 'Founder-final review requires exact base/head SHAs' };
  }
  if (!founderIdentity) return { ok: false, error: 'Founder-final review founder identity is missing' };
  if (!approvedAt || Number.isNaN(Date.parse(approvedAt))) {
    return { ok: false, error: 'Founder-final review approval time is invalid' };
  }
  return {
    ok: true,
    review: {
      contract: FOUNDER_FINAL_REVIEW_CONTRACT,
      pullRequestNumber: Number(pullRequestNumber),
      baseSha,
      headSha,
      founderIdentity,
      approvedAt,
    },
  };
}

function configuredRepositoryProvider(
  project: RepositoryProjectRow,
): { provider: RepositoryProvider; config: ProviderProjectConfig } | { error: string } {
  if (!project.repo_identifier) {
    return { error: `Repository identifier is missing for project "${project.slug}"` };
  }

  const config: ProviderProjectConfig = {
    repo_provider: project.repo_provider,
    slug: project.slug,
    repo_identifier: project.repo_identifier,
  };
  const configError = providerConfigurationError(config);
  if (configError) return { error: configError };

  try {
    return { provider: providerForProject(config), config };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function validateEvidence(body: unknown): { ok: true; evidence: ProofEvidence } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'evidence must be an object' };
  }
  const evidence = body as Record<string, unknown>;

  const stringArrayFields = ['filesChanged', 'checksRun', 'failures', 'unresolvedRisks'] as const;
  for (const field of stringArrayFields) {
    if (!Array.isArray(evidence[field]) || !(evidence[field] as unknown[]).every((value) => typeof value === 'string')) {
      return { ok: false, error: `evidence.${field} must be a string array` };
    }
  }

  const stringFields = ['behaviorChanged', 'securityImpact', 'deploymentImpact', 'rollbackPath'] as const;
  for (const field of stringFields) {
    if (typeof evidence[field] !== 'string' || (evidence[field] as string).trim() === '') {
      return { ok: false, error: `evidence.${field} must be a non-empty string` };
    }
  }

  return { ok: true, evidence: evidence as unknown as ProofEvidence };
}

async function verifyExactHeadEvidence(
  missionId: string,
  requiredChecks: EvidenceKind[],
  expectedHeadSha: string,
): Promise<{ ok: true; summary: Record<string, string> } | { ok: false; error: string; details?: unknown }> {
  if (!requiredChecks.length) {
    return { ok: false, error: 'Mission has no required machine checks.' };
  }

  const { data: rows, error } = await supabase
    .from('evidence')
    .select('kind, status, commit_sha, provider, created_at')
    .eq('mission_id', missionId)
    .in('kind', requiredChecks)
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, error: 'Unable to read machine evidence.', details: error.message };
  }

  const latest = new Map<string, { status: string; commitSha: string | null; provider: string | null }>();
  for (const row of rows ?? []) {
    if (latest.has(row.kind)) continue;
    latest.set(row.kind, {
      status: row.status,
      commitSha: row.commit_sha ? String(row.commit_sha).toLowerCase() : null,
      provider: row.provider ?? null,
    });
  }

  const missing = requiredChecks.filter((kind) => !latest.has(kind));
  const failing = requiredChecks.filter((kind) => latest.get(kind)?.status !== 'pass');
  const wrongHead = requiredChecks.filter(
    (kind) => latest.get(kind)?.commitSha !== expectedHeadSha.toLowerCase(),
  );
  const wrongProvider = requiredChecks.filter((kind) => {
    if (!WEBHOOK_ONLY_EVIDENCE_KINDS.has(kind)) return false;
    const evidence = latest.get(kind);
    return evidence !== undefined && evidence.provider !== 'github';
  });

  if (missing.length || failing.length || wrongHead.length || wrongProvider.length) {
    return {
      ok: false,
      error: 'Exact-head machine evidence is incomplete.',
      details: { missing, failing, wrongHead, wrongProvider, expectedHeadSha },
    };
  }

  return {
    ok: true,
    summary: Object.fromEntries(
      requiredChecks.map((kind) => [
        kind,
        `${latest.get(kind)!.status}@${latest.get(kind)!.commitSha}${latest.get(kind)!.provider ? `:${latest.get(kind)!.provider}` : ''}`,
      ]),
    ),
  };
}

async function requireFreshProof(missionId: string, actionType: string) {
  const proofCutoff = new Date(Date.now() - PROOF_GATE_TTL_MS).toISOString();
  return supabase
    .from('proof_gate_results')
    .select('id, status, created_at, gate_id')
    .eq('mission_id', missionId)
    .eq('gate_id', actionType)
    .eq('status', 'pass')
    .gte('created_at', proofCutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function findExecution(idempotencyKey: string): Promise<{
  data: ExecutionRecord | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from('approval_executions')
    .select('id, mission_id, project_id, action_type, status, result, success')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return { data: data as ExecutionRecord | null, error };
}

approvalsRouter.post(
  '/:missionId/run-proof-gate',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const body = req.body as Record<string, unknown>;
    const gateId = body['gateId'];

    if (typeof gateId !== 'string' || gateId.trim() === '') {
      return res.status(400).json({ error: '`gateId` must be a non-empty string' });
    }

    const evidenceValidation = validateEvidence(body['evidence']);
    if (!evidenceValidation.ok) {
      return res.status(400).json({ error: evidenceValidation.error });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, base_ref, policy_snapshot')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const controller = new ProofGateController();
    const result = await controller.run({
      projectId: mission.project_id as string,
      controller: 'ProofGateController',
      resourceId: missionId,
      reason: 'founder_triggered',
      meta: {
        gateId,
        evidence: evidenceValidation.evidence,
        approvedBy: req.founder!.email,
      },
    });

    if (result.status === 'blocked' && result.message?.includes('could not be persisted')) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to persist proof gate result — gate cannot authorize execution',
        detail: result.message,
      });
    }

    if (result.status === 'converged' && gateId === 'merge' && mission.status === 'in_review') {
      let expectedHeadSha: string | null = null;
      let independentReview: FounderPinnedIndependentReview | null = null;
      let founderFinalReview: FounderPinnedFinalReview | null = null;

      if (mission.branch_ref) {
        const { data: project } = await supabase
          .from('projects')
          .select('slug, repo_provider, repo_identifier')
          .eq('id', mission.project_id as string)
          .maybeSingle();

        if (project?.repo_identifier) {
          const projectRow = project as RepositoryProjectRow;
          const configured = configuredRepositoryProvider(projectRow);
          if ('error' in configured) {
            return res.status(502).json({
              ok: false,
              error: 'Proof passed but the repository provider is unavailable — approval not persisted.',
              detail: configured.error,
            });
          }
          try {
            expectedHeadSha = await configured.provider.resolveRef(project.slug, mission.branch_ref);
          } catch (err) {
            return res.status(502).json({
              ok: false,
              error: 'Proof passed but the branch head could not be resolved — approval not persisted.',
              detail: err instanceof Error ? err.message : String(err),
            });
          }

          if (isFounderControlRoomRepository(projectRow)) {
            const founderFinalCandidate = body['founderFinalReview'];
            const founderFinalApproval = founderFinalCandidate === undefined
              ? null
              : validateFounderFinalReviewApproval(founderFinalCandidate);
            const legacyReviewApproval = founderFinalCandidate === undefined
              ? validateIndependentReviewApproval(body['independentReview'])
              : null;

            if (founderFinalApproval && !founderFinalApproval.ok) {
              return res.status(400).json({
                ok: false,
                code: 'FOUNDER_FINAL_REVIEW_REQUIRED',
                error: founderFinalApproval.error,
              });
            }
            if (legacyReviewApproval && !legacyReviewApproval.ok) {
              return res.status(400).json({
                ok: false,
                code: 'FOUNDER_FINAL_REVIEW_REQUIRED',
                error: `${legacyReviewApproval.error}. Canonical FCR flow uses founderFinalReview.confirmExactCandidate=true.`,
              });
            }

            const pullRequestNumber = founderFinalApproval?.ok
              ? founderFinalApproval.pullRequestNumber
              : legacyReviewApproval?.ok
                ? legacyReviewApproval.pullRequestNumber
                : null;
            const reviewPolicy = founderFinalApproval?.ok
              ? FCR_FOUNDER_FINAL_REVIEW_POLICY
              : legacyReviewApproval?.ok
                ? legacyReviewApproval.policy
                : null;
            if (!pullRequestNumber || !reviewPolicy) {
              return res.status(400).json({
                ok: false,
                code: 'FOUNDER_FINAL_REVIEW_REQUIRED',
                error: 'FCR merge approval requires founderFinalReview metadata bound to the exact candidate.',
              });
            }
            if (typeof configured.provider.getPullRequestReviewContext !== 'function') {
              return res.status(502).json({
                ok: false,
                code: 'INDEPENDENT_REVIEW_PROVIDER_UNAVAILABLE',
                error: 'Repository provider cannot supply exact pull request review context.',
              });
            }

            let pullRequest;
            try {
              pullRequest = await configured.provider.getPullRequestReviewContext(
                project.slug,
                pullRequestNumber,
              );
            } catch (err) {
              return res.status(502).json({
                ok: false,
                code: 'INDEPENDENT_REVIEW_PR_READ_FAILED',
                error: 'Proof passed but exact pull request identity could not be read — approval not persisted.',
                detail: err instanceof Error ? err.message : String(err),
              });
            }

            const expectedBaseRef = text(mission.base_ref) || 'main';
            const prMismatch =
              lower(pullRequest.repository) !== FCR_REPOSITORY
              || lower(pullRequest.headRepository) !== FCR_REPOSITORY
              || pullRequest.baseRef !== expectedBaseRef
              || pullRequest.headRef !== mission.branch_ref
              || lower(pullRequest.headSha) !== lower(expectedHeadSha);
            if (prMismatch) {
              return res.status(409).json({
                ok: false,
                code: 'INDEPENDENT_REVIEW_PR_MISMATCH',
                error: 'Founder approval PR does not match the exact FCR branch/base/head being approved.',
              });
            }
            if (!FULL_SHA.test(text(pullRequest.baseSha)) || !text(pullRequest.authorIdentity)) {
              return res.status(502).json({
                ok: false,
                code: 'INDEPENDENT_REVIEW_PR_IDENTITY_INCOMPLETE',
                error: 'Provider PR identity is missing an exact base SHA or author identity.',
              });
            }

            independentReview = {
              pullRequestNumber,
              baseSha: lower(pullRequest.baseSha),
              authorIdentity: text(pullRequest.authorIdentity),
              policy: reviewPolicy,
              policyHash: independentReviewPolicyHash(reviewPolicy),
            };

            if (founderFinalApproval?.ok) {
              founderFinalReview = {
                contract: FOUNDER_FINAL_REVIEW_CONTRACT,
                pullRequestNumber,
                baseSha: lower(pullRequest.baseSha),
                headSha: lower(expectedHeadSha),
                founderIdentity: req.founder!.email,
                approvedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

      const { error: updateError } = await supabase
        .from('missions')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
          ...(expectedHeadSha
            ? {
                policy_snapshot: {
                  ...(mission.policy_snapshot as Record<string, unknown> ?? {}),
                  expectedHeadSha,
                  ...(independentReview ? { independentReview } : {}),
                  ...(founderFinalReview ? { founderFinalReview } : {}),
                },
              }
            : {}),
        })
        .eq('id', missionId)
        .eq('status', 'in_review');

      if (updateError) {
        return res.status(500).json({
          ok: false,
          error: 'Proof passed but mission approval state could not be persisted.',
          detail: updateError.message,
        });
      }
    }

    const status = result.status === 'converged' ? 200 : 422;
    return res.status(status).json({
      ok: result.status === 'converged',
      gateStatus: result.status,
      attestationType: 'manual',
      actions: result.proposedActions,
      message: result.message,
    });
  },
);

approvalsRouter.post(
  '/:missionId/execute',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const { actionType, idempotencyKey, payload = {} } = req.body as {
      actionType: string;
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    };

    if (!actionType || !idempotencyKey) {
      return res.status(400).json({ error: 'actionType and idempotencyKey are required' });
    }

    if (actionType === 'deploy') {
      return res.status(501).json({
        error: 'Deployment execution is not implemented',
        code: 'DEPLOYMENT_NOT_SUPPORTED',
      });
    }

    if (!PROOF_GATED_ACTIONS.has(actionType)) {
      return res.status(400).json({ error: `Unknown actionType: ${actionType}` });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, required_checks, policy_snapshot')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const projectId = mission.project_id as string;
    const expectedScope = { missionId, projectId, actionType };

    const { data: proofRecord, error: proofError } = await requireFreshProof(missionId, actionType);
    if (proofError) {
      return res.status(500).json({
        error: 'Failed to verify proof gate — cannot proceed',
        detail: proofError.message,
      });
    }
    if (!proofRecord) {
      return res.status(403).json({
        error: `Action '${actionType}' requires a passing proof gate result within the last 15 minutes.`,
        code: 'PROOF_GATE_REQUIRED',
        hint: `Call POST /approvals/${missionId}/run-proof-gate with gateId: "${actionType}" first.`,
      });
    }

    const existingLookup = await findExecution(idempotencyKey);
    if (existingLookup.error) {
      return res.status(500).json({
        error: 'Unable to inspect the action idempotency ledger.',
        detail: existingLookup.error.message,
      });
    }
    if (existingLookup.data) {
      if (!executionScopeMatches(existingLookup.data, expectedScope)) {
        return res.status(409).json({
          ok: false,
          code: 'IDEMPOTENCY_SCOPE_MISMATCH',
          error: 'This idempotency key belongs to a different mission, project, or action.',
        });
      }
      if (existingLookup.data.status === 'succeeded') {
        return res.json({ ok: true, idempotent: true, result: existingLookup.data.result });
      }
      if (existingLookup.data.status === 'pending') {
        return res.status(409).json({
          ok: false,
          code: 'ACTION_ALREADY_PENDING',
          error: 'This approved action is already reserved or may have executed. Reconcile it before retrying.',
          executionId: existingLookup.data.id,
        });
      }
      return res.status(409).json({
        ok: false,
        code: 'ACTION_PREVIOUSLY_FAILED',
        error: 'This idempotency key is bound to a prior failed action. Use a new approval and key after review.',
        result: existingLookup.data.result,
      });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_provider, repo_identifier')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(500).json({ error: 'Project repository configuration not found.' });
    }

    const projectRow = project as RepositoryProjectRow;
    const configured = configuredRepositoryProvider(projectRow);
    if ('error' in configured) {
      return res.status(503).json({
        error: 'Repository provider is not configured.',
        code: 'REPOSITORY_PROVIDER_UNAVAILABLE',
        detail: configured.error,
      });
    }
    const provider = configured.provider;

    // Reserve before external mutation. The unique idempotency key is the final
    // race barrier if two requests pass the preceding lookup concurrently.
    const { data: reservation, error: reservationError } = await supabase
      .from('approval_executions')
      .insert({
        mission_id: missionId,
        project_id: projectId,
        action_type: actionType,
        idempotency_key: idempotencyKey,
        executed_by: req.founder!.email,
        status: 'pending',
        request: payload,
        result: {},
        success: null,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (reservationError || !reservation) {
      const racedLookup = await findExecution(idempotencyKey);
      if (racedLookup.data && !executionScopeMatches(racedLookup.data, expectedScope)) {
        return res.status(409).json({
          ok: false,
          code: 'IDEMPOTENCY_SCOPE_MISMATCH',
          error: 'This idempotency key belongs to a different mission, project, or action.',
        });
      }
      if (racedLookup.data?.status === 'succeeded') {
        return res.json({ ok: true, idempotent: true, result: racedLookup.data.result });
      }
      if (racedLookup.data) {
        return res.status(409).json({
          ok: false,
          code: 'ACTION_ALREADY_RESERVED',
          error: 'Another request reserved this action. Reconcile that execution before retrying.',
          executionId: racedLookup.data.id,
        });
      }
      return res.status(500).json({
        error: 'Unable to reserve the approved action; no provider mutation was attempted.',
        code: 'ACTION_RESERVATION_FAILED',
        detail: reservationError?.message ?? 'Reservation insert returned no record.',
      });
    }

    let executionResult: Record<string, unknown> = {};
    let executionError: string | null = null;
    const warnings: string[] = [];

    try {
      if (actionType === 'create_branch') {
        if (mission.status !== 'proposed') {
          throw new Error(`Mission must be proposed before branch creation; current status is ${mission.status}.`);
        }
        const branchName = (payload['branchName'] as string) ?? `mission/${missionId.slice(0, 8)}`;
        const baseRef = (payload['baseRef'] as string) ?? 'main';
        await provider.createBranch(project.slug, baseRef, branchName);

        let expectedHeadSha: string | null = null;
        try {
          expectedHeadSha = await provider.resolveRef(project.slug, branchName);
        } catch (resolveError) {
          warnings.push(
            `Branch was created, but its head commit could not be resolved and pinned: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}`,
          );
        }

        executionResult = { branchName, baseRef, ...(expectedHeadSha ? { expectedHeadSha } : {}) };

        const { error: missionUpdateError } = await supabase
          .from('missions')
          .update({
            branch_ref: branchName,
            status: 'sandboxed',
            updated_at: new Date().toISOString(),
            ...(expectedHeadSha
              ? { policy_snapshot: { ...(mission.policy_snapshot as Record<string, unknown> ?? {}), expectedHeadSha } }
              : {}),
          })
          .eq('id', missionId)
          .eq('status', 'proposed');
        if (missionUpdateError) {
          warnings.push(`Branch was created, but mission state update failed: ${missionUpdateError.message}`);
        }
      } else {
        if (mission.status !== 'approved') {
          throw new Error(`Mission must be approved before merge; current status is ${mission.status}.`);
        }

        const head = (payload['head'] as string) ?? mission.branch_ref;
        const base = (payload['base'] as string) ?? 'main';
        const expectedHeadSha = typeof payload['expectedHeadSha'] === 'string'
          ? payload['expectedHeadSha'].toLowerCase()
          : '';
        if (!head) throw new Error('No head branch to merge');
        if (!FULL_SHA.test(expectedHeadSha)) {
          throw new Error('Merge requires expectedHeadSha as a full 40-character commit SHA.');
        }

        const missionExpectedHead = typeof mission.policy_snapshot?.expectedHeadSha === 'string'
          ? mission.policy_snapshot.expectedHeadSha.toLowerCase()
          : '';
        if (!missionExpectedHead || missionExpectedHead !== expectedHeadSha) {
          throw new Error('Merge SHA does not match the mission policy snapshot.');
        }

        const evidenceResult = await verifyExactHeadEvidence(
          missionId,
          (mission.required_checks ?? []) as EvidenceKind[],
          expectedHeadSha,
        );
        if (!evidenceResult.ok) {
          throw new Error(`${evidenceResult.error} ${JSON.stringify(evidenceResult.details ?? {})}`);
        }

        let independentReviewEvidence: Record<string, unknown> | null = null;
        let founderFinalReviewEvidence: Record<string, unknown> | null = null;
        if (isFounderControlRoomRepository(projectRow)) {
          const pinnedResult = readPinnedIndependentReview(mission.policy_snapshot?.independentReview);
          if (!pinnedResult.ok) {
            throw new Error(`Independent review gate blocked: ${pinnedResult.error}`);
          }
          const pinned = pinnedResult.review;
          const founderFinalMode = pinned.policy.founderFinalApprovalRequired === true;
          const founderFinalResult = founderFinalMode
            ? readPinnedFounderFinalReview(mission.policy_snapshot?.founderFinalReview)
            : null;
          if (founderFinalResult && !founderFinalResult.ok) {
            throw new Error(`Founder-final review gate blocked: ${founderFinalResult.error}`);
          }
          const founderFinal = founderFinalResult?.ok ? founderFinalResult.review : null;

          if (founderFinal) {
            const approvalAgeMs = Date.now() - Date.parse(founderFinal.approvedAt);
            const founderFinalMatches =
              founderFinal.pullRequestNumber === pinned.pullRequestNumber
              && founderFinal.baseSha === pinned.baseSha
              && founderFinal.headSha === expectedHeadSha
              && lower(founderFinal.founderIdentity) === lower(req.founder!.email);
            if (!founderFinalMatches) {
              throw new Error('Founder-final review gate blocked: authenticated founder receipt does not match the exact approved PR/base/head');
            }
            if (approvalAgeMs < -60_000 || approvalAgeMs > PROOF_GATE_TTL_MS) {
              throw new Error('Founder-final review gate blocked: exact-candidate founder approval is stale or future-dated');
            }
            founderFinalReviewEvidence = {
              contract: founderFinal.contract,
              pullRequestNumber: founderFinal.pullRequestNumber,
              baseSha: founderFinal.baseSha,
              headSha: founderFinal.headSha,
              founderIdentity: founderFinal.founderIdentity,
              approvedAt: founderFinal.approvedAt,
            };
          }

          if (typeof provider.getPullRequestReviewContext !== 'function') {
            throw new Error('Independent review gate blocked: repository provider cannot supply pull request context');
          }

          const pullRequest = await provider.getPullRequestReviewContext(project.slug, pinned.pullRequestNumber);
          const providerIdentityMatches =
            lower(pullRequest.repository) === FCR_REPOSITORY
            && lower(pullRequest.headRepository) === FCR_REPOSITORY
            && pullRequest.baseRef === base
            && pullRequest.headRef === head
            && lower(pullRequest.baseSha) === pinned.baseSha
            && lower(pullRequest.headSha) === expectedHeadSha
            && lower(pullRequest.authorIdentity) === lower(pinned.authorIdentity);
          if (!providerIdentityMatches) {
            throw new Error('Independent review gate blocked: provider PR identity changed after founder approval');
          }

          const currentPolicyHash = independentReviewPolicyHash(pinned.policy);
          if (currentPolicyHash !== pinned.policyHash) {
            throw new Error('Independent review gate blocked: founder-pinned policy hash does not match policy content');
          }

          const diff = await provider.compare(project.slug, pinned.baseSha, expectedHeadSha);
          if (diff.behindBy !== 0 || diff.aheadBy < 1) {
            throw new Error(
              `Independent review gate blocked: reviewed head must be current with approved base (ahead=${diff.aheadBy}, behind=${diff.behindBy})`,
            );
          }
          const diffHash = independentReviewDiffHash(diff);
          const reviews = Array.isArray(payload['independentReviews'])
            ? payload['independentReviews'] as IndependentReviewReceipt[]
            : [];
          const reviewGate = await evaluateIndependentReviewGate(
            provider,
            {
              projectId: project.slug,
              repository: project.repo_identifier,
              pullRequestNumber: pinned.pullRequestNumber,
              baseSha: pinned.baseSha,
              headSha: expectedHeadSha,
              diffHash,
              policyHash: pinned.policyHash,
              authorIdentity: pinned.authorIdentity,
            },
            reviews,
            pinned.policy,
          );
          if (!reviewGate.reviewGateSatisfied) {
            throw new Error(`Independent review gate blocked: ${reviewGate.blockers.join('; ')}`);
          }
          independentReviewEvidence = {
            pullRequestNumber: pinned.pullRequestNumber,
            baseSha: pinned.baseSha,
            headSha: expectedHeadSha,
            diffHash,
            policyHash: pinned.policyHash,
            witnessedReviewHashes: reviewGate.witnessedReviewHashes,
            semanticClearCount: reviewGate.semanticClearCount,
            deterministicClearCount: reviewGate.deterministicClearCount,
            authorityMode: founderFinalMode ? 'deterministic-review-then-founder-final' : 'legacy-independent-human-review',
          };
        }

        // This is deliberately after review/founder-final validation. Provider
        // reads may take time; the mutable head must still equal the approved
        // SHA at the last possible moment before integration.
        const currentHeadSha = await provider.resolveRef(project.slug, head);
        if (currentHeadSha !== expectedHeadSha) {
          throw new Error(
            `Branch moved after verification: current ${currentHeadSha}, approved ${expectedHeadSha}.`,
          );
        }

        const mergeCommitSha = await provider.integrate(project.slug, base, head);
        executionResult = {
          mergeCommitSha,
          head,
          base,
          expectedHeadSha,
          evidence: evidenceResult.summary,
          ...(independentReviewEvidence ? { independentReview: independentReviewEvidence } : {}),
          ...(founderFinalReviewEvidence ? { founderFinalReview: founderFinalReviewEvidence } : {}),
        };

        const { error: missionUpdateError } = await supabase
          .from('missions')
          .update({ status: 'integrated', updated_at: new Date().toISOString() })
          .eq('id', missionId)
          .eq('status', 'approved');
        if (missionUpdateError) {
          warnings.push(`Merge succeeded, but mission state update failed: ${missionUpdateError.message}`);
        }
      }
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
    }

    if (warnings.length) executionResult.warnings = warnings;

    const finalResult = executionError ? { error: executionError } : executionResult;
    const { error: auditUpdateError } = await supabase
      .from('approval_executions')
      .update({
        status: executionError ? 'failed' : 'succeeded',
        result: finalResult,
        success: !executionError,
        executed_at: new Date().toISOString(),
      })
      .eq('id', reservation.id)
      .eq('status', 'pending');

    if (auditUpdateError) {
      return res.status(500).json({
        ok: false,
        code: 'ACTION_AUDIT_INCOMPLETE',
        error: 'The provider action finished, but the execution ledger could not be finalized. Do not retry automatically.',
        executionId: reservation.id,
        providerOutcome: finalResult,
        detail: auditUpdateError.message,
      });
    }

    if (executionError) {
      return res.status(409).json({ ok: false, error: executionError, executionId: reservation.id });
    }

    await enqueueReconcile({
      projectId,
      controller: 'MissionController',
      resourceId: missionId,
      reason: 'dependency_changed',
    });

    return res.json({ ok: true, result: executionResult, executionId: reservation.id });
  },
);

/**
 * POST /:missionId/patch
 *
 * Founder-gated read/write/edit action: commits file changes onto a
 * mission's OWN sandbox branch — never onto the project's base ref.
 *
 * This is deliberately unguarded by the proof-gate — it edits a branch
 * nobody has approved yet, which is what sandboxes are for. The proof-gate
 * and exact-head verification in `/:missionId/execute` remain the only path
 * that can move code onto `base_ref`, so this route cannot be used to
 * bypass approval; it only changes what a pending approval will see.
 */
approvalsRouter.post(
  '/:missionId/patch',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const { message, changes } = req.body as { message?: unknown; changes?: unknown };

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes must be a non-empty array' });
    }

    for (const change of changes as Array<Record<string, unknown>>) {
      if (typeof change?.['path'] !== 'string' || !isSafeRepoPath(change['path'] as string)) {
        return res.status(400).json({ error: `Invalid or unsafe path: ${JSON.stringify(change?.['path'])}` });
      }
      if (change['delete'] !== true && typeof change['content'] !== 'string') {
        return res.status(400).json({
          error: `changes for "${change['path'] as string}" must include string content unless delete is true`,
        });
      }
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, policy_snapshot')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (!PATCHABLE_MISSION_STATUSES.has(mission.status)) {
      return res.status(409).json({
        error: `Mission must be sandboxed or in_review to accept edits; current status is ${mission.status}.`,
        code: 'MISSION_NOT_EDITABLE',
      });
    }
    if (!mission.branch_ref) {
      return res.status(409).json({
        error: 'Mission has no branch yet. Call POST /:missionId/execute with actionType "create_branch" first.',
        code: 'MISSION_HAS_NO_BRANCH',
      });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_provider, repo_identifier')
      .eq('id', mission.project_id as string)
      .single();

    if (projectError || !project) {
      return res.status(500).json({ error: 'Project repository configuration not found.' });
    }

    const configured = configuredRepositoryProvider(project as RepositoryProjectRow);
    if ('error' in configured) {
      return res.status(503).json({
        error: 'Repository provider is not configured.',
        code: 'REPOSITORY_PROVIDER_UNAVAILABLE',
        detail: configured.error,
      });
    }
    const provider = configured.provider;

    let commitSha: string;
    try {
      commitSha = await provider.commitPatch(project.slug, mission.branch_ref, {
        message,
        changes: changes as PatchFileChange[],
        authorName: 'founder-control-room',
      });
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Patch commit failed',
        code: 'PATCH_COMMIT_FAILED',
      });
    }

    await supabase.from('project_events').insert({
      project_id: project.id,
      source_event_id: randomUUID(),
      event_type: 'mission_patch_committed',
      severity: 'info',
      screen: 'control-room-api',
      metadata: {
        route: `POST /approvals/${missionId}/patch`,
        committed_by: req.founder!.email,
        branch: mission.branch_ref,
        commitSha,
        filesChanged: (changes as Array<Record<string, unknown>>).map((c) => c['path']),
      },
    });

    // Re-pin expectedHeadSha to this new commit. Without this, the pin set
    // at create_branch goes stale the moment a founder edits the sandbox
    // again — CheckRunController only attributes an incoming CI webhook's
    // evidence to this mission when its head_sha matches the current pin, so
    // a stale pin silently orphans every check run reported against the new
    // commit (evidence gets persisted with mission_id: null and never
    // reaches MissionController at all).
    let warning: string | undefined;
    const { error: pinUpdateError } = await supabase
      .from('missions')
      .update({
        policy_snapshot: { ...(mission.policy_snapshot as Record<string, unknown> ?? {}), expectedHeadSha: commitSha },
        updated_at: new Date().toISOString(),
      })
      .eq('id', missionId);
    if (pinUpdateError) {
      warning = `Commit succeeded, but expectedHeadSha could not be re-pinned: ${pinUpdateError.message}`;
    }

    return res.status(201).json({ ok: true, commitSha, branch: mission.branch_ref, ...(warning ? { warning } : {}) });
  },
);
