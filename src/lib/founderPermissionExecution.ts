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

export const FOUNDER_EXECUTION_BINDING_CONTRACT = 'juss-v10/founder-execution-binding@v1' as const;

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

export async function observePromptOSExecutionState(input: {
  request: FounderPermissionRequest;
  provider: RepositoryProvider;
}): Promise<{
  headSha: string;
  workflowContentHash: string;
  registryContentHash: string;
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

  return { headSha, workflowContentHash, registryContentHash };
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
