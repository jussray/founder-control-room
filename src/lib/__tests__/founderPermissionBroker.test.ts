import { describe, expect, it } from 'vitest';
import {
  createFounderPermissionRequest,
  founderPermissionRequestHash,
  resolveFounderPermissionRequest,
} from '../founderPermissionBroker.js';

const proposal = {
  proposalId: 'mission-123',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'merge',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};

const actionTarget = {
  type: 'merge' as const,
  repo: 'jussray/founder-control-room',
  pullRequestNumber: 727,
  baseSha: 'd'.repeat(40),
  headSha: 'b'.repeat(40),
};

const registryProposal = {
  proposalId: 'promptos-workflow-repair-production-recovery',
  proposalHash: 'e'.repeat(64),
  projectSlug: 'promptos',
  actionType: 'promptos_workflow_registry_promote',
  expectedHeadSha: 'f'.repeat(40),
  capabilityPlanHash: null,
};

const registryTarget = {
  type: 'promptos_workflow_registry_promote' as const,
  repo: 'jussray/promptos',
  branch: 'main',
  headSha: 'f'.repeat(40),
  workflowId: 'repair-production-recovery',
  workflowVersion: '1.0',
  workflowContentHash: `sha256:${'e'.repeat(64)}`,
  registryPath: 'workflows/registry.json',
  workflowPath: 'workflows/repair-production-recovery.workflow.json',
};

describe('Founder Permission Broker', () => {
  it('creates an exact-target pending request without granting authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:mission-123',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget,
      note: 'Please approve the exact merge candidate.',
    });
    expect(request.actionTarget).toEqual(actionTarget);
    expect(request.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.requestHash).toBe(founderPermissionRequestHash({
      requestId: request.requestId,
      requestedBySurface: request.requestedBySurface,
      proposal: request.proposal,
      actionTarget: request.actionTarget,
      note: request.note,
    }));
  });

  it('binds a PromptOS workflow registry request to exact source and content identity', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:promptos-workflow-001',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: registryTarget,
      note: 'Promote only this exact workflow draft after founder approval.',
    });

    expect(request.actionTarget).toEqual(registryTarget);
    expect(request.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.requestHash).toBe(founderPermissionRequestHash({
      requestId: request.requestId,
      requestedBySurface: request.requestedBySurface,
      proposal: request.proposal,
      actionTarget: request.actionTarget,
      note: request.note,
    }));
  });

  it('rejects malformed proposal identity before a request can enter the ledger', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:bad-proposal',
      requestedBySurface: 'claude',
      proposal: { ...proposal, proposalHash: 'not-a-hash' },
      actionTarget,
    })).toThrow(/proposalHash/);
  });

  it('fails closed when merge scope omits the exact repository and PR target', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:missing-target',
      requestedBySurface: 'chatgpt',
      proposal,
    })).toThrow(/exact merge actionTarget/);
  });

  it('fails closed when the merge target head disagrees with the proposal head', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:wrong-target-head',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget: { ...actionTarget, headSha: 'e'.repeat(40) },
    })).toThrow(/expectedHeadSha must equal actionTarget headSha/);
  });

  it('fails closed when PromptOS workflow content identity disagrees with the proposal', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:promptos-wrong-content',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: { ...registryTarget, workflowContentHash: `sha256:${'1'.repeat(64)}` },
    })).toThrow(/proposalHash must equal the exact workflow content hash/);
  });

  it('fails closed when PromptOS registry branch or workflow path widens scope', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:promptos-wrong-branch',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: { ...registryTarget, branch: 'release' },
    })).toThrow(/restricted to main/);

    expect(() => createFounderPermissionRequest({
      requestId: 'permission:promptos-wrong-path',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: { ...registryTarget, workflowPath: 'workflows/other.workflow.json' },
    })).toThrow(/workflowPath must match the workflow id/);
  });

  it('records explicit founder approval as FCR provenance without execution authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:approve-123',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget,
    });
    const resolution = resolveFounderPermissionRequest({ request, decision: 'approved' });
    expect(resolution.status).toBe('approved');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.surface).toBe('fcr');
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.decision.requestHash).toBe(request.requestHash);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('keeps PromptOS registry approval non-authorizing until execution binding exists', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:promptos-approve-001',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: registryTarget,
    });
    const resolution = resolveFounderPermissionRequest({ request, decision: 'approved' });

    expect(resolution.status).toBe('approved');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.surface).toBe('fcr');
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.request.actionTarget).toEqual(registryTarget);
  });

  it('does not turn denial into execution authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:reject-123',
      requestedBySurface: 'claude',
      proposal,
      actionTarget,
    });
    const resolution = resolveFounderPermissionRequest({ request, decision: 'rejected' });
    expect(resolution.status).toBe('rejected');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('rejects a tampered request target before recording a decision', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:tamper-123',
      requestedBySurface: 'perplexity',
      proposal,
      actionTarget,
    });
    expect(() => resolveFounderPermissionRequest({
      request: {
        ...request,
        actionTarget: { ...actionTarget, pullRequestNumber: 728 },
      },
      decision: 'approved',
    })).toThrow(/request hash/);
  });

  it('rejects PromptOS workflow target tampering before recording a decision', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:promptos-tamper-001',
      requestedBySurface: 'chatgpt',
      proposal: registryProposal,
      actionTarget: registryTarget,
    });

    expect(() => resolveFounderPermissionRequest({
      request: {
        ...request,
        actionTarget: { ...registryTarget, workflowVersion: '1.1' },
      },
      decision: 'approved',
    })).toThrow(/request hash/);
  });
});
