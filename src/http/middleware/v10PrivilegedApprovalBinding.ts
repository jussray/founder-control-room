import type { NextFunction, Response } from 'express';
import {
  V10_CAPABILITY_REGISTRY_CONTRACT,
  isV10CapabilityPlan,
  isV10CapabilityRef,
  validateV10CapabilityPlan,
  v10CapabilityRegistryHash,
  type V10CapabilityPlan,
  type V10CapabilityRef,
} from '../../founder-os-lab/capabilityKernel.js';
import { supabase } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import type { FounderRequest } from './requireFounder.js';

const PRIVILEGED_ACTIONS = new Set(['merge', 'create_branch']);
const FULL_SHA = /^[0-9a-f]{40}$/i;

type PrivilegedAction = 'merge' | 'create_branch';
type JsonRecord = Record<string, unknown>;

interface ProjectRow {
  id: string;
  slug: string;
  repo_provider: string;
  repo_identifier: string;
}

interface MissionRow {
  id: string;
  project_id: string;
  branch_ref: string | null;
}

interface ProposalRow {
  branch_name: string | null;
  base_ref: string | null;
}

interface RegistrySnapshotRow {
  registry_hash: string;
  contract: string;
  status: string;
  entries: unknown;
  approved_by: string | null;
  approved_at: string | null;
}

interface ExistingExecutionRow {
  mission_id: string | null;
  action_type: string;
  status: string;
  result: Record<string, unknown> | null;
}

export interface V10ApprovedRegistrySnapshot {
  registryHash: string;
  contract: string;
  status: string;
  entries: unknown[];
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface V10PrivilegedExecutionContext {
  actionType: PrivilegedAction;
  projectSlug: string;
  expectedHeadSha: string;
  observedHeadSha: string;
  registryApproved: boolean;
  plan: V10CapabilityPlan;
}

export interface V10PrivilegedEnvelope {
  planContract: 'juss-v10/capability-plan@v1';
  capabilityPlanHash: string;
  registryHash: string;
  expectedHeadSha: string;
  projectSlug: string;
  requestedAuthority: 'reversible' | 'privileged';
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredAuthority(actionType: PrivilegedAction): 'reversible' | 'privileged' {
  return actionType === 'merge' ? 'privileged' : 'reversible';
}

function capabilityIdentity(capability: V10CapabilityRef): string {
  return JSON.stringify([
    capability.id.trim(),
    capability.version.trim(),
    capability.origin,
    capability.owner.trim(),
    capability.sourceHash.trim().toLowerCase(),
    capability.authorityCeiling,
  ]);
}

export function validateV10ApprovedRegistrySnapshot(
  plan: V10CapabilityPlan,
  snapshot: V10ApprovedRegistrySnapshot,
): string[] {
  const reasons: string[] = [];
  const planRegistryHash = plan.registryHash.trim().toLowerCase();
  const snapshotHash = snapshot.registryHash.trim().toLowerCase();

  if (snapshot.contract !== V10_CAPABILITY_REGISTRY_CONTRACT) {
    reasons.push('capability registry snapshot contract is unsupported');
  }
  if (snapshot.status !== 'approved' || !text(snapshot.approvedBy) || !text(snapshot.approvedAt)) {
    reasons.push('capability registry snapshot is not founder-approved');
  }
  if (snapshotHash !== planRegistryHash) {
    reasons.push('capability plan registry hash does not match the approved snapshot identity');
  }
  if (snapshot.entries.length === 0) {
    reasons.push('approved capability registry snapshot contains no entries');
    return reasons;
  }

  const validEntries = snapshot.entries.filter(isV10CapabilityRef);
  if (validEntries.length !== snapshot.entries.length) {
    reasons.push('approved capability registry snapshot contains a malformed capability entry');
    return reasons;
  }
  if (v10CapabilityRegistryHash(validEntries) !== snapshotHash) {
    reasons.push('approved capability registry snapshot hash does not match its canonical entries');
  }

  const registryById = new Map<string, V10CapabilityRef>();
  for (const entry of validEntries) {
    const id = entry.id.trim();
    if (registryById.has(id)) {
      reasons.push(`approved capability registry contains duplicate capability id: ${id}`);
      continue;
    }
    registryById.set(id, entry);
  }

  for (const capability of plan.capabilities) {
    const approved = registryById.get(capability.id.trim());
    if (!approved || capabilityIdentity(approved) !== capabilityIdentity(capability)) {
      reasons.push(`capability ${capability.id} is not exactly authorized by the approved registry snapshot`);
    }
  }

  return [...new Set(reasons)];
}

export function validateV10PrivilegedExecutionContext(
  context: V10PrivilegedExecutionContext,
): string[] {
  const reasons = validateV10CapabilityPlan(context.plan);
  const expectedHeadSha = context.expectedHeadSha.trim().toLowerCase();
  const observedHeadSha = context.observedHeadSha.trim().toLowerCase();
  const projectSlug = context.projectSlug.trim();
  const authority = requiredAuthority(context.actionType);

  if (context.plan.projectSlug.trim() !== projectSlug) {
    reasons.push('capability plan project does not match the privileged execution project');
  }
  if (!FULL_SHA.test(expectedHeadSha) || context.plan.expectedHeadSha.toLowerCase() !== expectedHeadSha) {
    reasons.push('capability plan exact head does not match the privileged execution head');
  }
  if (observedHeadSha !== expectedHeadSha) {
    reasons.push('repository head moved after the capability plan was selected');
  }
  if (context.plan.requestedAuthority !== authority) {
    reasons.push(`${context.actionType} requires V10 ${authority} authority`);
  }
  if (!context.registryApproved) {
    reasons.push('capability plan registry is not founder-approved');
  }

  return [...new Set(reasons)];
}

export function v10PrivilegedEnvelope(
  actionType: PrivilegedAction,
  plan: V10CapabilityPlan,
): V10PrivilegedEnvelope {
  return {
    planContract: plan.contract,
    capabilityPlanHash: plan.planHash.toLowerCase(),
    registryHash: plan.registryHash.toLowerCase(),
    expectedHeadSha: plan.expectedHeadSha.toLowerCase(),
    projectSlug: plan.projectSlug.trim(),
    requestedAuthority: requiredAuthority(actionType),
  };
}

async function latestProposal(missionId: string): Promise<ProposalRow | null> {
  const { data, error } = await supabase
    .from('change_proposals')
    .select('branch_name, base_ref')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('v10_change_proposal_lookup_failed');
  return data as ProposalRow | null;
}

async function approvedRegistrySnapshot(registryHash: string): Promise<V10ApprovedRegistrySnapshot | null> {
  const { data, error } = await supabase
    .from('capability_registry_snapshots')
    .select('registry_hash, contract, status, entries, approved_by, approved_at')
    .eq('registry_hash', registryHash.toLowerCase())
    .eq('status', 'approved')
    .maybeSingle();
  if (error) throw new Error('v10_registry_resolution_failed');
  if (!data) return null;

  const row = data as RegistrySnapshotRow;
  return {
    registryHash: text(row.registry_hash).toLowerCase(),
    contract: text(row.contract),
    status: text(row.status),
    entries: Array.isArray(row.entries) ? row.entries : [],
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}

async function completedExecution(
  idempotencyKey: string,
): Promise<{ data: ExistingExecutionRow | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('approval_executions')
    .select('mission_id, action_type, status, result')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return { data: data as ExistingExecutionRow | null, error };
}

/**
 * Compatibility bridge for the older mission executor.
 *
 * It does not execute anything. It turns the existing route into a V10-bound
 * consumer by validating the Chief plan, approved registry, exact repository
 * head, project identity, and authority before the route can reserve its
 * approval_executions row. Only the sanitized `_v10` envelope is inserted into
 * the existing payload; the full plan is not copied into the execution ledger.
 */
export async function requireV10PrivilegedApprovalBinding(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const body = isRecord(req.body) ? req.body : null;
  const actionType = text(body?.actionType);
  if (!PRIVILEGED_ACTIONS.has(actionType)) return next();

  const privilegedAction = actionType as PrivilegedAction;
  const missionId = text(req.params.missionId);
  if (!missionId) {
    return res.status(400).json({ error: 'missionId is required', code: 'V10_MISSION_REQUIRED' });
  }

  const idempotencyKey = text(body?.idempotencyKey);
  if (idempotencyKey) {
    try {
      const existing = await completedExecution(idempotencyKey);
      if (existing.error) {
        return res.status(503).json({
          error: 'V10 idempotency ledger could not be verified.',
          code: 'V10_IDEMPOTENCY_UNAVAILABLE',
        });
      }
      if (existing.data?.status === 'succeeded') {
        if (existing.data.mission_id !== missionId || existing.data.action_type !== privilegedAction) {
          return res.status(409).json({
            ok: false,
            code: 'IDEMPOTENCY_SCOPE_MISMATCH',
            error: 'This idempotency key belongs to a different mission or action.',
          });
        }
        return res.json({ ok: true, idempotent: true, result: existing.data.result });
      }
    } catch {
      return res.status(503).json({
        error: 'V10 idempotency ledger could not be verified.',
        code: 'V10_IDEMPOTENCY_UNAVAILABLE',
      });
    }
  }

  const planValue = body?.capabilityPlan;
  if (!isV10CapabilityPlan(planValue)) {
    return res.status(400).json({
      error: 'Privileged approval execution requires a Chief AI V10 capability plan.',
      code: 'V10_CAPABILITY_PLAN_REQUIRED',
    });
  }
  const plan = planValue;

  try {
    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, branch_ref')
      .eq('id', missionId)
      .single();
    if (missionError || !missionData) {
      return res.status(404).json({ error: 'Mission not found', code: 'V10_MISSION_NOT_FOUND' });
    }
    const mission = missionData as MissionRow;

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_provider, repo_identifier')
      .eq('id', mission.project_id)
      .single();
    if (projectError || !projectData) {
      return res.status(404).json({ error: 'Project not found', code: 'V10_PROJECT_NOT_FOUND' });
    }
    const project = projectData as ProjectRow;
    const proposal = await latestProposal(missionId);

    const payload = isRecord(body?.payload) ? body!.payload as JsonRecord : {};
    const provider = providerForProject(project);
    let refToResolve: string;

    if (privilegedAction === 'merge') {
      const approvedHeadRef = text(mission.branch_ref) || text(proposal?.branch_name);
      const submittedHeadRef = text(payload.head) || text(payload.branchName);
      if (approvedHeadRef && submittedHeadRef && submittedHeadRef !== approvedHeadRef) {
        return res.status(409).json({
          error: 'Submitted merge head does not match the mission/proposal branch.',
          code: 'V10_MERGE_HEAD_REF_MISMATCH',
        });
      }
      const headRef = approvedHeadRef || submittedHeadRef;
      if (!headRef) {
        return res.status(409).json({
          error: 'Merge execution has no branch identity to bind to the V10 plan.',
          code: 'V10_BRANCH_BINDING_REQUIRED',
        });
      }

      const approvedBaseRef = text(proposal?.base_ref);
      const submittedBaseRef = text(payload.base);
      if (approvedBaseRef && submittedBaseRef && submittedBaseRef !== approvedBaseRef) {
        return res.status(409).json({
          error: 'Submitted merge base does not match the approved proposal base.',
          code: 'V10_MERGE_BASE_REF_MISMATCH',
        });
      }
      const baseRef = approvedBaseRef || submittedBaseRef || 'main';

      const submittedHeadSha = text(payload.expectedHeadSha).toLowerCase();
      if (submittedHeadSha && submittedHeadSha !== plan.expectedHeadSha.toLowerCase()) {
        return res.status(409).json({
          error: 'Submitted merge head does not match the V10 capability plan.',
          code: 'V10_HEAD_BINDING_MISMATCH',
        });
      }

      payload.head = headRef;
      payload.base = baseRef;
      payload.expectedHeadSha = plan.expectedHeadSha.toLowerCase();
      refToResolve = headRef;
    } else {
      const approvedBranchName = text(proposal?.branch_name);
      const submittedBranchName = text(payload.branchName);
      if (approvedBranchName && submittedBranchName && submittedBranchName !== approvedBranchName) {
        return res.status(409).json({
          error: 'Submitted branch name does not match the approved proposal branch.',
          code: 'V10_CREATE_BRANCH_REF_MISMATCH',
        });
      }
      const branchName = approvedBranchName || submittedBranchName || `mission/${missionId.slice(0, 8)}`;

      const approvedBaseRef = text(proposal?.base_ref);
      const submittedBaseRef = text(payload.baseRef);
      if (approvedBaseRef && submittedBaseRef && submittedBaseRef !== approvedBaseRef) {
        return res.status(409).json({
          error: 'Submitted branch base does not match the approved proposal base.',
          code: 'V10_CREATE_BASE_REF_MISMATCH',
        });
      }
      const baseRef = approvedBaseRef || submittedBaseRef || 'main';
      payload.branchName = branchName;
      payload.baseRef = baseRef;
      refToResolve = baseRef;
    }

    const observedHeadSha = (await provider.resolveRef(project.slug, refToResolve)).toLowerCase();
    const snapshot = await approvedRegistrySnapshot(plan.registryHash);
    const reasons = validateV10PrivilegedExecutionContext({
      actionType: privilegedAction,
      projectSlug: project.slug,
      expectedHeadSha: plan.expectedHeadSha,
      observedHeadSha,
      registryApproved: snapshot !== null,
      plan,
    });
    if (snapshot) reasons.push(...validateV10ApprovedRegistrySnapshot(plan, snapshot));

    const uniqueReasons = [...new Set(reasons)];
    if (uniqueReasons.length > 0) {
      return res.status(409).json({
        error: 'V10 privileged approval binding failed.',
        code: 'V10_PRIVILEGED_BINDING_REJECTED',
        reasons: uniqueReasons,
      });
    }

    payload._v10 = v10PrivilegedEnvelope(privilegedAction, plan);
    body!.payload = payload;
    return next();
  } catch (error) {
    return res.status(503).json({
      error: 'V10 privileged approval binding could not be verified.',
      code: 'V10_PRIVILEGED_BINDING_UNAVAILABLE',
      detail: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
