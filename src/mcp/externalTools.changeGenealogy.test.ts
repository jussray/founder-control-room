import { describe, expect, it, vi } from 'vitest';
import {
  createExternalMcpToolExecutor,
  externalMcpToolDefinitions,
  type ExternalMcpReceipt,
} from './externalTools.js';

const identity = {
  userId: 'founder-user',
  email: 'founder@example.com',
  clientId: 'client-1',
  authMode: 'oauth' as const,
};

const receipt: ExternalMcpReceipt = {
  contract: 'founder-control-room/external-mcp-receipt@v1',
  id: 'receipt-1',
  projectSlug: 'founder-control-room',
  toolName: 'fcr_audit_change_genealogy',
  requestHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  createdAt: '2026-09-23T05:00:00.000Z',
  privacy: {
    cookiesUsed: false,
    fingerprintsUsed: false,
    rawArgumentsStored: false,
    rawResultStored: false,
  },
};

describe('fcr_audit_change_genealogy external MCP tool', () => {
  it('advertises the bounded 10-PR comments+diff defaults', () => {
    const definition = externalMcpToolDefinitions().find(
      (tool) => tool.name === 'fcr_audit_change_genealogy',
    ) as Record<string, any> | undefined;

    expect(definition).toBeDefined();
    expect(definition?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(definition?.inputSchema?.properties?.limit?.default).toBe(10);
    expect(definition?.inputSchema?.properties?.includeComments?.default).toBe(true);
    expect(definition?.inputSchema?.properties?.includeDiff?.default).toBe(true);
  });

  it('keeps the audit inside the server-held project grant and forwards exact defaults', async () => {
    const auditChangeGenealogy = vi.fn(async (input) => ({
      contract: 'founder-control-room/github-change-genealogy@v1',
      input,
    }));
    const recordEvidence = vi.fn(async (input) => ({
      ...receipt,
      projectSlug: input.projectSlug,
      toolName: input.toolName,
    }));
    const execute = createExternalMcpToolExecutor({
      auditChangeGenealogy,
      recordEvidence,
    });

    const result = await execute({
      name: 'fcr_audit_change_genealogy',
      arguments: { projectId: 'founder-control-room' },
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'request-1',
    });

    expect(auditChangeGenealogy).toHaveBeenCalledWith({
      projectSlug: 'founder-control-room',
      limit: 10,
      includeComments: true,
      includeDiff: true,
    });
    expect(result.governanceBoundary).toMatchObject({
      readOrPreviewOnly: true,
      mutationAuthority: false,
      executionAllowed: false,
      founderApprovalGranted: false,
    });
  });

  it('fails closed when a caller asks for a project outside the grant', async () => {
    const execute = createExternalMcpToolExecutor({
      auditChangeGenealogy: vi.fn(),
      recordEvidence: vi.fn(),
    });

    await expect(execute({
      name: 'fcr_audit_change_genealogy',
      arguments: { projectId: 'chief-ai-machine' },
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'request-2',
    })).rejects.toThrow('outside this remote MCP grant');
  });

  it('rejects window expansion beyond the bounded ceiling', async () => {
    const execute = createExternalMcpToolExecutor({
      auditChangeGenealogy: vi.fn(),
      recordEvidence: vi.fn(),
    });

    await expect(execute({
      name: 'fcr_audit_change_genealogy',
      arguments: { projectId: 'founder-control-room', limit: 21 },
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'request-3',
    })).rejects.toThrow('limit must be an integer between 1 and 20');
  });
});
