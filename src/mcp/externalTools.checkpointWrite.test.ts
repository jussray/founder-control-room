import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import {
  createExternalMcpToolExecutor,
  externalMcpToolDefinitions,
  type ExternalMcpReceipt,
  type ExternalMcpToolName,
  type ExternalMcpIdentity,
} from './externalTools.js';
import type { OperatorExecutionContinuation } from '../lib/operatorContinuity.js';

const identity = {
  userId: 'test-founder',
  email: 'founder@example.invalid',
  clientId: 'allowed-test-client',
  authMode: 'oauth' as const,
};
const projectId = 'founder-control-room';
const repo = 'jussray/founder-control-room';
const checkpointInput = {
  sourceMode: 'chat',
  taskId: 'cross-chat-probe',
  intentRef: 'fcr:intents/cross-chat-probe',
  contextRefs: ['github:cross-chat-probe'],
  completedSteps: [{ stepId: 'inspect', evidenceRefs: ['github:commit-readback'] }],
  remainingStepIds: ['verify'],
  nextActionRef: 'fcr:actions/verify',
  pendingDecisionRefs: [],
  observation: {
    source: 'chatgpt',
    projectSlug: projectId,
    repositoryFullName: repo,
    targetBranch: 'main',
    targetSha: 'a'.repeat(40),
    prNumber: null,
    baseSha: null,
    headSha: null,
    scopeFingerprint: null,
    proofFingerprint: null,
    reviewFingerprint: null,
    providerFingerprint: null,
    runtimeFingerprint: null,
    authorityFingerprint: null,
    evidenceRefs: ['github:commit-readback'],
    observedAt: '2026-11-21T10:00:00.000Z',
    expiresAt: '2026-11-21T11:00:00.000Z',
    predecessorFingerprint: null,
  },
};
const invoke = (name: ExternalMcpToolName, args: Record<string, unknown>,
  auth: ExternalMcpIdentity = identity, allowed = [projectId]) => ({
  name, arguments: args, allowedProjects: new Set(allowed),
  identity: auth, requestId: 'test-rpc',
});
const recordEvidence = vi.fn(async (input: { toolName: ExternalMcpToolName; risk?: string }): Promise<ExternalMcpReceipt> => ({
  contract: 'founder-control-room/external-mcp-receipt@v1',
  id: 'receipt-test',
  projectSlug: projectId,
  toolName: input.toolName,
  requestHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  createdAt: '2026-11-21T10:00:00.000Z',
  privacy: {
    cookiesUsed: false, fingerprintsUsed: false,
    rawArgumentsStored: false, rawResultStored: false,
  },
}));

describe('OAuth-only FCR MCP task checkpoint save/resume', () => {
  it('advertises a non-destructive internal write instead of a second read tool', () => {
    const definition = externalMcpToolDefinitions().find(tool => tool.name === 'fcr_save_task_checkpoint');
    expect(definition?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
  });

  it('lets two independent OAuth-bound clients exchange only historical task references', async () => {
    let saved: OperatorExecutionContinuation | null = null;
    const saveTaskCheckpoint = vi.fn(async ({ continuation }: { continuation: OperatorExecutionContinuation }) => {
      saved = continuation;
      return { disposition: 'stored', taskId: continuation.taskId, currentEvidenceVerified: false };
    });
    const getTaskCheckpoint = vi.fn(async ({ taskId }: { taskId: string }) => ({
      found: latest()?.taskId === taskId,
      continuation: saved === null ? null : { record: saved, status: 'PERSISTED_NOT_REVALIDATED' },
      currentEvidenceVerified: false,
      executionAuthorityFromHandoff: false,
    }));
    const adapters = {
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ [identity.clientId]: 'chatgpt' }) },
      saveTaskCheckpoint, getTaskCheckpoint, recordEvidence,
    };
    const writer = createExternalMcpToolExecutor(adapters);
    const reader = createExternalMcpToolExecutor(adapters);
    const written = await writer(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: checkpointInput,
    }));
    const resumed = await reader(invoke('fcr_get_task_checkpoint', {
      projectId, taskId: checkpointInput.taskId,
    }));
    expect(written.governanceBoundary).toMatchObject({
      readOrPreviewOnly: false, internalCheckpointPersistenceOnly: true,
      mutationAuthority: false, executionAllowed: false, founderApprovalGranted: false,
    });
    expect(resumed.governanceBoundary).toMatchObject({
      readOrPreviewOnly: true, executionAllowed: false,
    });
    const returned = resumed.data as { continuation: { record: OperatorExecutionContinuation } };
    expect(returned.continuation.record.taskId).toBe(checkpointInput.taskId);
    expect(returned.continuation.record.sourceOperator).toBe('chatgpt');
    expect(returned.continuation.record.destinationOperator).toBe('codex');
    expect(returned.continuation.record.authorizing).toBe(false);
    expect(returned.continuation.record.approvalCarryForward).toBe(false);
    expect(returned.continuation.record.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(saveTaskCheckpoint).toHaveBeenCalledTimes(1);
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'fcr_save_task_checkpoint', risk: 'external_side_effect',
    }));
  });

  it('enforces the A-to-B result handoff and independent verification lifecycle', async () => {
    let saved: OperatorExecutionContinuation | null = null;
    const saveTaskCheckpoint = vi.fn(async ({ continuation }: { continuation: OperatorExecutionContinuation }) => {
      saved = continuation;
      return { disposition: 'stored', taskId: continuation.taskId };
    });
    const latest = (): OperatorExecutionContinuation | null => saved;
    const getTaskCheckpoint = vi.fn(async () => ({
      found: latest() !== null,
      continuation: latest() === null ? null : { record: latest(), status: 'PERSISTED_NOT_REVALIDATED' },
    }));
    const adapters = { saveTaskCheckpoint, getTaskCheckpoint, recordEvidence };
    const sessionA = createExternalMcpToolExecutor({
      ...adapters,
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ [identity.clientId]: 'chatgpt' }) },
    });
    const sessionB = createExternalMcpToolExecutor({
      ...adapters,
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ 'codex-client': 'codex' }) },
    });

    await sessionA(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: { ...checkpointInput, taskState: 'ACTIVE' },
    }));
    expect(latest()?.sourceOperator).toBe('chatgpt');
    expect(latest()?.destinationOperator).toBe('codex');
    expect(latest()?.taskState).toBe('ACTIVE');

    await sessionB(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'chatgpt',
      continuationInput: { ...checkpointInput, taskState: 'RESULT_SUBMITTED', resultRef: 'artifact:result-1' },
    }, { ...identity, clientId: 'codex-client' }));
    expect(latest()?.sourceOperator).toBe('codex');
    expect(latest()?.resultSubmittedByOperator).toBe('codex');
    expect(latest()?.taskState).toBe('RESULT_SUBMITTED');

    await sessionA(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'chatgpt',
      continuationInput: { ...checkpointInput, taskState: 'VERIFIED', verificationRefs: ['github:verify-1'] },
    }));
    expect(latest()?.verifiedByOperator).toBe('chatgpt');
    expect(latest()?.verifiedByOperator).not.toBe(latest()?.resultSubmittedByOperator);
    expect(latest()?.taskState).toBe('VERIFIED');

    await sessionA(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'chatgpt',
      continuationInput: { ...checkpointInput, taskState: 'CLOSED' },
    }));
    expect(latest()?.taskState).toBe('CLOSED');
    expect(latest()?.closedAt).toMatch(/^\\d{4}-\\d{2}-\\d{2}T/);
    expect(latest()?.authorizing).toBe(false);
    expect(latest()?.approvalCarryForward).toBe(false);
    expect(latest()?.browserCookie).toBe(false);
    expect(saveTaskCheckpoint).toHaveBeenCalledTimes(4);
  });

  it('refuses non-OAuth identities and cross-project grants before saving', async () => {
    const saveTaskCheckpoint = vi.fn();
    const client = createExternalMcpToolExecutor({
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ [identity.clientId]: 'chatgpt' }) },
      getTaskCheckpoint: vi.fn(async () => ({ found: false, continuation: null })),
      saveTaskCheckpoint, recordEvidence,
    });
    await expect(client(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: checkpointInput,
    }, { ...identity, authMode: 'static' as const }))).rejects.toThrow('founder-bound OAuth');
    await expect(client(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: checkpointInput,
    }, identity, ['chief-ai-machine']))).rejects.toThrow('outside this remote MCP grant');
    expect(saveTaskCheckpoint).not.toHaveBeenCalled();
  });

  it('rejects raw conversation text and mismatched checkpoint project', async () => {
    const saveTaskCheckpoint = vi.fn();
    const client = createExternalMcpToolExecutor({
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ [identity.clientId]: 'chatgpt' }) },
      getTaskCheckpoint: vi.fn(async () => ({ found: false, continuation: null })),
      saveTaskCheckpoint, recordEvidence,
    });
    await expect(client(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: { ...checkpointInput, contextRefs: ['private chat transcript'] },
    }))).rejects.toThrow('source reference');
    await expect(client(invoke('fcr_save_task_checkpoint', {
      projectId, destinationOperator: 'codex', continuationInput: {
        ...checkpointInput, observation: { ...checkpointInput.observation, projectSlug: 'other-project' },
      },
    }))).rejects.toThrow('project does not match caller grant');
    expect(saveTaskCheckpoint).not.toHaveBeenCalled();
  });
});
