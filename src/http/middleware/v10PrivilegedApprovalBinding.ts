import type { NextFunction, Response } from 'express';
import {
  isV10CapabilityPlan,
  validateV10CapabilityPlan,
  type V10CapabilityPlan,
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

async function registryApproved(registryHash: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_v10_registry_approved', {
    candidate_hash: registryHash.toLowerCase(),
  });
  if (error) throw new Error('v10_registry_resolution_failed');
  return data === true;
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
  const planValue = body?.capabilityPlan;
  if (!isV10CapabilityPlan(planValue)) {
    return res.status(400).json({
      error: 'Privileged approval execution requires a Chief AI V10 capability plan.',
      code: 'V10_CAPABILITY_PLAN_REQUIRED',
    });
  }
  const plan = planValue;

  const missionId = text(req.params.missionId);
  if (!missionId) {
    return res.status(400).json({ error: 'missionId is required', code: 'V10_MISSION_REQUIRED' });
  }

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
      refToResolve = text(payload.branchName) || text(mission.branch_ref) || text(proposal?.branch_name);
      if (!refToResolve) {
        return res.status(409).json({
          error: 'Merge execution has no branch identity to bind to the V10 plan.',
          code: 'V10_BRANCH_BINDING_REQUIRED',
        });
      }
      const submittedHead = text(payload.expectedHeadSha).toLowerCase();
      if (submittedHead && submittedHead !== plan.expectedHeadSha.toLowerCase()) {
        return res.status(409).json({
          error: 'Submitted merge head does not match the V10 capability plan.',
          code: 'V10_HEAD_BINDING_MISMATCH',
        });
      }
      payload.expectedHeadSha = plan.expectedHeadSha.toLowerCase();
    } else {
      refToResolve = text(payload.baseRef) || text(proposal?.base_ref) || 'main';
      payload.baseRef = refToResolve;
    }

    const observedHeadSha = (await provider.resolveRef(project.slug, refToResolve)).toLowerCase();
    const approved = await registryApproved(plan.registryHash);
    const reasons = validateV10PrivilegedExecutionContext({
      actionType: privilegedAction,
      projectSlug: project.slug,
      expectedHeadSha: plan.expectedHeadSha,
      observedHeadSha,
      registryApproved: approved,
      plan,
    });
    if (reasons.length > 0) {
      return res.status(409).json({
        error: 'V10 privileged approval binding failed.',
        code: 'V10_PRIVILEGED_BINDING_REJECTED',
        reasons,
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
