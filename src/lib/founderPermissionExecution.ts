import { createHash } from 'node:crypto';
import {
  PROMPTOS_WORKFLOW_REGISTRY_ACTION,
  PROMPTOS_WORKFLOW_REGISTRY_CAPABILITY,
  PROMPTOS_WORKFLOW_REGISTRY_CONSEQUENCE,
  PROMPTOS_WORKFLOW_REGISTRY_PROVIDER,
  type FounderPermissionPromptOSWorkflowRegistryTarget,
  type FounderPermissionRequest,
} from './founderPermissionBroker.js';
import type { RepositoryProvider } from '../providers/RepositoryProvider.js';
import type { PromptOSRegistryWriter } from '../providers/PromptOSRegistryWriter.js';

export const FOUNDER_EXECUTION_BINDING_CONTRACT = 'juss-v10/founder-execution-binding@v1' as const;
export const PROMPTOS_REGISTRY_EFFECT_RECEIPT_CONTRACT = 'juss-v10/promptos-registry-effect@v1' as const;

export interface FounderExecutionBinding {
  contract: typeof FOUNDER_EXECUTION_BINDING_CONTRACT;
  requestHash: string;
  decisionHash: string;
  actionType: typeof PROMPTOS_WORKFLOW_REGISTRY_ACTION;
  providerIdentity: typeof PROMPTOS_WORKFLOW_REGISTRY_PROVIDER;
  capabilityVersion: typeof PROMPTOS_WORKFLOW_REGISTRY_CAPABILITY;
  consequence: typeof PROMPTOS_WORKFLOW_REGISTRY_CONSEQUENCE;
  observedHeadSha: string;
  observedWorkflowContentHash: string;
  observedRegistryContentHash: string;
  observedAt: string;
  singleUse: true;
  mustRevalidateBeforeEffect: true;
  executionAuthorized: true;
  bindingHash: string;
}

export interface PromptOSRegistryEffectReceipt {
  contract: typeof PROMPTOS_REGISTRY_EFFECT_RECEIPT_CONTRACT;
  requestHash: string;
  actionType: typeof PROMPTOS_WORKFLOW_REGISTRY_ACTION;
  workflowId: string;
  workflowVersion: string;
  preHeadSha: string;
  postHeadSha: string;
  workflowContentHash: string;
  preRegistryContentHash: string;
  postRegistryContentHash: string;
  providerDisposition: 'COMMITTED' | 'RECONCILED_AFTER_AMBIGUOUS_RESPONSE';
  outcomeVerified: true;
  executionAuthorized: false;
}

function sha256Content(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function canonicalBindingIdentity(input: Omit<FounderExecutionBinding, 'bindingHash'>): string {
  return JSON.stringify([
    input.contract,
    input.requestHash,
    input.decisionHash,
    input.actionType,
    input.providerIdentity,
    input.capabilityVersion,
    input.consequence,
    input.observedHeadSha,
    input.observedWorkflowContentHash,
    input.observedRegistryContentHash,
    input.observedAt,
    input.singleUse,
    input.mustRevalidateBeforeEffect,
    input.executionAuthorized,
  ]);
}

export function founderExecutionBindingHash(input: Omit<FounderExecutionBinding, 'bindingHash'>): string {
  return createHash('sha256').update(canonicalBindingIdentity(input)).digest('hex');
}

function promptOSTarget(request: FounderPermissionRequest): FounderPermissionPromptOSWorkflowRegistryTarget {
  if (request.proposal.actionType !== PROMPTOS_WORKFLOW_REGISTRY_ACTION
    || !request.actionTarget
    || request.actionTarget.type !== PROMPTOS_WORKFLOW_REGISTRY_ACTION) {
    throw new Error('founder execution binding currently supports only PromptOS workflow registry promotion');
  }
  return request.actionTarget;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROMPTOS_REGISTRY_INVALID_JSON_OBJECT');
  }
  return value as Record<string, unknown>;
}

export async function observePromptOSExecutionState(input: {
  request: FounderPermissionRequest;
  provider: RepositoryProvider;
}): Promise<{
  headSha: string;
  workflowContentHash: string;
  registryContentHash: string;
  workflowContent: string;
  registryContent: string;
}> {
  const target = promptOSTarget(input.request);
  const headSha = (await input.provider.resolveRef('promptos', target.branch)).toLowerCase();
  if (headSha !== target.headSha.toLowerCase()) {
    throw new Error('FOUNDER_EXECUTION_TARGET_MOVED: PromptOS main no longer matches the approved head');
  }

  const [workflowContent, registryContent] = await Promise.all([
    input.provider.readFile('promptos', target.headSha, target.workflowPath),
    input.provider.readFile('promptos', target.headSha, target.registryPath),
  ]);
  const workflowContentHash = sha256Content(workflowContent);
  const registryContentHash = sha256Content(registryContent);

  if (workflowContentHash !== target.workflowContentHash) {
    throw new Error('FOUNDER_EXECUTION_WORKFLOW_DRIFT: workflow content no longer matches the approved evidence');
  }
  if (registryContentHash !== target.registryContentHash) {
    throw new Error('FOUNDER_EXECUTION_REGISTRY_DRIFT: registry state no longer matches the approved evidence');
  }

  const workflow = jsonObject(JSON.parse(workflowContent) as unknown);
  if (workflow.artifactType !== 'promptos-workflow'
    || workflow.id !== target.workflowId
    || workflow.version !== target.workflowVersion) {
    throw new Error('FOUNDER_EXECUTION_WORKFLOW_IDENTITY_MISMATCH: workflow body does not match approved id/version');
  }

  return { headSha, workflowContentHash, registryContentHash, workflowContent, registryContent };
}

export async function createFounderExecutionBinding(input: {
  request: FounderPermissionRequest;
  decisionHash: string;
  provider: RepositoryProvider;
  now?: Date;
}): Promise<FounderExecutionBinding> {
  const target = promptOSTarget(input.request);
  const observation = await observePromptOSExecutionState({ request: input.request, provider: input.provider });
  const base: Omit<FounderExecutionBinding, 'bindingHash'> = {
    contract: FOUNDER_EXECUTION_BINDING_CONTRACT,
    requestHash: input.request.requestHash,
    decisionHash: input.decisionHash.toLowerCase(),
    actionType: PROMPTOS_WORKFLOW_REGISTRY_ACTION,
    providerIdentity: target.providerIdentity,
    capabilityVersion: target.capabilityVersion,
    consequence: target.consequence,
    observedHeadSha: observation.headSha,
    observedWorkflowContentHash: observation.workflowContentHash,
    observedRegistryContentHash: observation.registryContentHash,
    observedAt: (input.now ?? new Date()).toISOString(),
    singleUse: true,
    mustRevalidateBeforeEffect: true,
    executionAuthorized: true,
  };
  return { ...base, bindingHash: founderExecutionBindingHash(base) };
}

export async function revalidateFounderExecutionBindingAtEffect(input: {
  request: FounderPermissionRequest;
  binding: FounderExecutionBinding;
  provider: RepositoryProvider;
}): Promise<void> {
  if (input.binding.contract !== FOUNDER_EXECUTION_BINDING_CONTRACT
    || input.binding.requestHash !== input.request.requestHash
    || input.binding.bindingHash !== founderExecutionBindingHash({
      contract: input.binding.contract,
      requestHash: input.binding.requestHash,
      decisionHash: input.binding.decisionHash,
      actionType: input.binding.actionType,
      providerIdentity: input.binding.providerIdentity,
      capabilityVersion: input.binding.capabilityVersion,
      consequence: input.binding.consequence,
      observedHeadSha: input.binding.observedHeadSha,
      observedWorkflowContentHash: input.binding.observedWorkflowContentHash,
      observedRegistryContentHash: input.binding.observedRegistryContentHash,
      observedAt: input.binding.observedAt,
      singleUse: input.binding.singleUse,
      mustRevalidateBeforeEffect: input.binding.mustRevalidateBeforeEffect,
      executionAuthorized: input.binding.executionAuthorized,
    })) {
    throw new Error('FOUNDER_EXECUTION_BINDING_INVALID: execution binding identity is not intact');
  }

  const observation = await observePromptOSExecutionState({ request: input.request, provider: input.provider });
  if (observation.headSha !== input.binding.observedHeadSha
    || observation.workflowContentHash !== input.binding.observedWorkflowContentHash
    || observation.registryContentHash !== input.binding.observedRegistryContentHash) {
    throw new Error('FOUNDER_EXECUTION_BINDING_STALE: provider state changed after the execution binding was issued');
  }
}

export function buildPromptOSApprovedRegistryContent(input: {
  request: FounderPermissionRequest;
  registryContent: string;
}): string {
  const target = promptOSTarget(input.request);
  const registry = jsonObject(JSON.parse(input.registryContent) as unknown);
  if (registry.schemaVersion !== 1 || registry.authority !== 'source-controlled-approved-workflows') {
    throw new Error('PROMPTOS_REGISTRY_SCHEMA_UNSUPPORTED');
  }
  if (!Array.isArray(registry.workflows)) throw new Error('PROMPTOS_REGISTRY_WORKFLOWS_INVALID');

  const workflows = registry.workflows.map((entry) => jsonObject(entry));
  const sameVersion = workflows.find((entry) => entry.id === target.workflowId && entry.version === target.workflowVersion);
  const expectedPath = target.workflowPath;
  if (sameVersion) {
    if (sameVersion.status === 'approved' && sameVersion.path === expectedPath) {
      throw new Error('PROMPTOS_REGISTRY_ALREADY_APPROVED: exact workflow version is already registered');
    }
    throw new Error('PROMPTOS_REGISTRY_CONFLICT: workflow id/version already exists with different state');
  }

  workflows.push({
    id: target.workflowId,
    version: target.workflowVersion,
    status: 'approved',
    path: expectedPath,
  });
  return `${JSON.stringify({ ...registry, workflows }, null, 2)}\n`;
}

export async function executePromptOSWorkflowRegistryPromotion(input: {
  request: FounderPermissionRequest;
  binding: FounderExecutionBinding;
  provider: RepositoryProvider;
  writer: PromptOSRegistryWriter;
}): Promise<PromptOSRegistryEffectReceipt> {
  const target = promptOSTarget(input.request);
  await revalidateFounderExecutionBindingAtEffect({
    request: input.request,
    binding: input.binding,
    provider: input.provider,
  });

  const observation = await observePromptOSExecutionState({ request: input.request, provider: input.provider });
  const nextRegistryContent = buildPromptOSApprovedRegistryContent({
    request: input.request,
    registryContent: observation.registryContent,
  });
  const nextRegistryContentHash = sha256Content(nextRegistryContent);

  const commit = await input.writer.commitRegistryAtExpectedHead({
    expectedHeadSha: target.headSha,
    registryContent: nextRegistryContent,
    message: `feat(workflows): approve ${target.workflowId}@${target.workflowVersion}`,
    authorName: 'Founder Control Room',
  });

  const [postHeadSha, postRegistryContent] = await Promise.all([
    input.provider.resolveRef('promptos', target.branch),
    input.provider.readFile('promptos', commit.commitSha, target.registryPath),
  ]);
  if (postHeadSha.toLowerCase() !== commit.commitSha.toLowerCase()) {
    throw new Error('PROMPTOS_REGISTRY_OUTCOME_HEAD_MISMATCH: main does not equal committed promotion');
  }
  if (sha256Content(postRegistryContent) !== nextRegistryContentHash) {
    throw new Error('PROMPTOS_REGISTRY_OUTCOME_CONTENT_MISMATCH: provider readback does not equal intended registry');
  }

  const postRegistry = jsonObject(JSON.parse(postRegistryContent) as unknown);
  if (!Array.isArray(postRegistry.workflows)
    || !postRegistry.workflows.some((entry) => {
      const row = jsonObject(entry);
      return row.id === target.workflowId
        && row.version === target.workflowVersion
        && row.status === 'approved'
        && row.path === target.workflowPath;
    })) {
    throw new Error('PROMPTOS_REGISTRY_OUTCOME_ENTRY_MISSING: provider readback lacks approved workflow');
  }

  return {
    contract: PROMPTOS_REGISTRY_EFFECT_RECEIPT_CONTRACT,
    requestHash: input.request.requestHash,
    actionType: PROMPTOS_WORKFLOW_REGISTRY_ACTION,
    workflowId: target.workflowId,
    workflowVersion: target.workflowVersion,
    preHeadSha: target.headSha,
    postHeadSha: commit.commitSha,
    workflowContentHash: target.workflowContentHash,
    preRegistryContentHash: target.registryContentHash,
    postRegistryContentHash: nextRegistryContentHash,
    providerDisposition: commit.providerDisposition,
    outcomeVerified: true,
    executionAuthorized: false,
  };
}
