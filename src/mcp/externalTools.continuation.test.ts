import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import {
  createExternalMcpToolExecutor,
  externalMcpToolDefinitions,
  type ExternalMcpReceipt,
} from './externalTools.js';

const identity = {
  userId: 'synthetic-founder',
  email: 'founder@example.invalid',
  clientId: 'synthetic-chat-client',
  authMode: 'oauth' as const,
};
const receipt = (toolName: ExternalMcpReceipt['toolName']): ExternalMcpReceipt => ({
  contract: 'founder-control-room/external-mcp-receipt@v1',
  id: 'test-receipt',
  projectSlug: 'founder-control-room',
  toolName,
  requestHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  createdAt: '2026-11-21T12:00:00.000Z',
  privacy: {
    cookiesUsed: false, fingerprintsUsed: false,
    rawArgumentsStored: false, rawResultStored: false,
  },
});
const input = (name: 'fcr_list_task_checkpoints' | 'fcr_get_task_checkpoint',
  args: Record<string, unknown>, granted = ['founder-control-room']) => ({
  name, arguments: args, allowedProjects: new Set(granted),
  identity, requestId: 'synthetic-request',
});

describe('founder-only shared-task MCP discovery', () => {
  it('advertises read-only tools using the existing MCP surface, not a new endpoint', () => {
    for (const name of ['fcr_list_task_checkpoints', 'fcr_get_task_checkpoint']) {
      const definition = externalMcpToolDefinitions().find(tool => tool.name === name);
      expect(definition?.annotations).toMatchObject({
        readOnlyHint: true, destructiveHint: false, idempotentHint: true,
      });
      expect(definition?.inputSchema?.additionalProperties).toBe(false);
    }
  });

  it('lets two independent authorized clients discover and inspect the same saved task references', async () => {
    const listTaskCheckpoints = vi.fn(async ({ projectSlug, limit }: { projectSlug: string; limit: number }) => ({
      items: [{
        taskId: 'auth-repair', observedAt: '2026-11-21T12:00:00.000Z',
        status: 'PERSISTED_NOT_REVALIDATED',
      }], projectSlug, limit, currentEvidenceVerified: false, authorizesExecution: false,
    }));
    const getTaskCheckpoint = vi.fn(async ({ projectSlug, taskId }: {
      projectSlug: string; taskId: string;
    }) => ({
      found: true, continuation: { taskId, projectSlug, status: 'PERSISTED_NOT_REVALIDATED' },
      currentEvidenceVerified: false, executionAuthorityFromHandoff: false,
    }));
    const recordEvidence = vi.fn(async ({ toolName }: { toolName: ExternalMcpReceipt['toolName'] }) => receipt(toolName));
    const clientA = createExternalMcpToolExecutor({
      listTaskCheckpoints, getTaskCheckpoint, recordEvidence,
    });
    const clientB = createExternalMcpToolExecutor({
      listTaskCheckpoints, getTaskCheckpoint, recordEvidence,
    });
    const listed = await clientA(input('fcr_list_task_checkpoints', {
      projectId: 'founder-control-room',
    }));
    const resumed = await clientB(input('fcr_get_task_checkpoint', {
      projectId: 'founder-control-room', taskId: 'auth-repair',
    }));
    expect(listTaskCheckpoints).toHaveBeenCalledWith({
      projectSlug: 'founder-control-room', limit: 10,
    });
    expect(getTaskCheckpoint).toHaveBeenCalledWith({
      projectSlug: 'founder-control-room', taskId: 'auth-repair',
    });
    expect((listed.data as { items: Array<{ taskId: string }> }).items[0].taskId)
      .toBe((resumed.data as { continuation: { taskId: string } }).continuation.taskId);
    for (const response of [listed, resumed]) {
      expect(response.governanceBoundary).toMatchObject({
        readOrPreviewOnly: true, mutationAuthority: false,
        executionAllowed: false, founderApprovalGranted: false,
      });
    }
  });

  it('refuses ungranted projects before any persistence lookup', async () => {
    const getTaskCheckpoint = vi.fn();
    const listTaskCheckpoints = vi.fn();
    const client = createExternalMcpToolExecutor({
      getTaskCheckpoint, listTaskCheckpoints, recordEvidence: vi.fn(),
    });
    await expect(client(input('fcr_get_task_checkpoint', {
      projectId: 'chief-ai-machine', taskId: 'auth-repair',
    }))).rejects.toThrow('outside this remote MCP grant');
    expect(getTaskCheckpoint).not.toHaveBeenCalled();
    await expect(client(input('fcr_list_task_checkpoints', {
      projectId: 'chief-ai-machine',
    }))).rejects.toThrow('outside this remote MCP grant');
    expect(listTaskCheckpoints).not.toHaveBeenCalled();
  });

  it('rejects malformed task IDs, unauthorized fields and excessive discovery windows', async () => {
    const getTaskCheckpoint = vi.fn();
    const listTaskCheckpoints = vi.fn();
    const client = createExternalMcpToolExecutor({
      getTaskCheckpoint, listTaskCheckpoints, recordEvidence: vi.fn(),
    });
    await expect(client(input('fcr_get_task_checkpoint', {
      projectId: 'founder-control-room', taskId: '../untrusted',
    }))).rejects.toThrow('bounded task identifier');
    await expect(client(input('fcr_get_task_checkpoint', {
      projectId: 'founder-control-room', taskId: 'auth-repair', transcript: 'private data',
    }))).rejects.toThrow('unexpected fields');
    await expect(client(input('fcr_list_task_checkpoints', {
      projectId: 'founder-control-room', limit: 21,
    }))).rejects.toThrow('limit must be an integer between 1 and 20');
    expect(getTaskCheckpoint).not.toHaveBeenCalled();
    expect(listTaskCheckpoints).not.toHaveBeenCalled();
  });
});
