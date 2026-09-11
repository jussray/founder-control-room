import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RepositoryProvider } from '../../providers/RepositoryProvider.js';
import { createFounderPermissionRequest } from '../founderPermissionBroker.js';
import {
  createFounderExecutionBinding,
  revalidateFounderExecutionBindingAtEffect,
} from '../founderPermissionExecution.js';

const workflowContent = '{"id":"repair-production-recovery","version":"1.0"}\n';
const registryContent = '{"workflows":[]}\n';
const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const headSha = 'f'.repeat(40);

function provider(overrides: {
  headSha?: string;
  workflowContent?: string;
  registryContent?: string;
} = {}): RepositoryProvider {
  return {
    name: 'github',
    async resolveRef(projectId: string, ref: string) {
      expect(projectId).toBe('promptos');
      expect(ref).toBe('main');
      return overrides.headSha ?? headSha;
    },
    async readFile(projectId: string, ref: string, path: string) {
      expect(projectId).toBe('promptos');
      expect(ref).toBe(headSha);
      if (path === 'workflows/repair-production-recovery.workflow.json') {
        return overrides.workflowContent ?? workflowContent;
      }
      if (path === 'workflows/registry.json') {
        return overrides.registryContent ?? registryContent;
      }
      throw new Error(`unexpected path ${path}`);
    },
  } as RepositoryProvider;
}

function request() {
  return createFounderPermissionRequest({
    requestId: 'permission:promptos-exec-001',
    requestedBySurface: 'chatgpt',
    proposal: {
      proposalId: 'promptos-workflow-repair-production-recovery',
      proposalHash: hash(workflowContent).slice('sha256:'.length),
      projectSlug: 'promptos',
      actionType: 'promptos_workflow_registry_promote',
      expectedHeadSha: headSha,
      capabilityPlanHash: null,
    },
    actionTarget: {
      type: 'promptos_workflow_registry_promote',
      repo: 'jussray/promptos',
      branch: 'main',
      headSha,
      workflowId: 'repair-production-recovery',
      workflowVersion: '1.0',
      workflowContentHash: hash(workflowContent),
      registryContentHash: hash(registryContent),
      registryPath: 'workflows/registry.json',
      workflowPath: 'workflows/repair-production-recovery.workflow.json',
      providerIdentity: 'github:jussray/promptos',
      capabilityVersion: 'promptos-workflow-registry@v1',
      consequence: 'CONSEQUENTIAL_WRITE',
    },
  });
}

describe('Founder execution binding', () => {
  it('issues a single-use binding only from trusted exact provider state', async () => {
    const binding = await createFounderExecutionBinding({
      request: request(),
      decisionHash: 'a'.repeat(64),
      provider: provider(),
      now: new Date('2026-09-11T05:00:00.000Z'),
    });

    expect(binding.executionAuthorized).toBe(true);
    expect(binding.singleUse).toBe(true);
    expect(binding.mustRevalidateBeforeEffect).toBe(true);
    expect(binding.observedHeadSha).toBe(headSha);
    expect(binding.observedWorkflowContentHash).toBe(hash(workflowContent));
    expect(binding.observedRegistryContentHash).toBe(hash(registryContent));
    expect(binding.bindingHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed when the approved branch head moved', async () => {
    await expect(createFounderExecutionBinding({
      request: request(), decisionHash: 'a'.repeat(64), provider: provider({ headSha: '1'.repeat(40) }),
    })).rejects.toThrow(/TARGET_MOVED/);
  });

  it('fails closed when workflow evidence drifted under the approved subject', async () => {
    await expect(createFounderExecutionBinding({
      request: request(), decisionHash: 'a'.repeat(64), provider: provider({ workflowContent: '{"changed":true}\n' }),
    })).rejects.toThrow(/WORKFLOW_DRIFT/);
  });

  it('fails closed when mutable registry state drifted', async () => {
    await expect(createFounderExecutionBinding({
      request: request(), decisionHash: 'a'.repeat(64), provider: provider({ registryContent: '{"workflows":["other"]}\n' }),
    })).rejects.toThrow(/REGISTRY_DRIFT/);
  });

  it('detects binding tamper before effect', async () => {
    const binding = await createFounderExecutionBinding({
      request: request(), decisionHash: 'a'.repeat(64), provider: provider(),
    });
    await expect(revalidateFounderExecutionBindingAtEffect({
      request: request(),
      binding: { ...binding, observedHeadSha: '1'.repeat(40) },
      provider: provider(),
    })).rejects.toThrow(/BINDING_INVALID/);
  });

  it('revalidates provider state immediately before effect', async () => {
    const binding = await createFounderExecutionBinding({
      request: request(), decisionHash: 'a'.repeat(64), provider: provider(),
    });
    await expect(revalidateFounderExecutionBindingAtEffect({
      request: request(), binding, provider: provider({ headSha: '1'.repeat(40) }),
    })).rejects.toThrow(/TARGET_MOVED/);
  });
});
