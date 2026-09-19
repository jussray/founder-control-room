import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./vaultHub.js', () => ({
  hubForMcpProject: vi.fn(),
}));
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {},
}));

type ExternalToolsModule = typeof import('./externalTools.js');
type RelayCall = {
  fromOperator: 'gemini' | 'codex' | 'claude-code' | 'perplexity';
  toOperator: 'gemini' | 'codex' | 'claude-code' | 'perplexity';
  capability: 'research' | 'propose' | 'review' | 'implement';
  goal: string;
  contextSummary: string;
  sourceRef?: string | null;
  sensitivity: 'public' | 'internal' | 'restricted';
};

let externalTools: ExternalToolsModule;

beforeAll(async () => {
  externalTools = await import('./externalTools.js');
});

function receipt(toolName: 'fcr_relay_operator') {
  return {
    contract: 'founder-control-room/external-mcp-receipt@v1' as const,
    id: 'relay-receipt-1',
    projectSlug: 'founder-control-room',
    toolName,
    requestHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    createdAt: '2026-09-16T18:00:00.000Z',
    privacy: {
      cookiesUsed: false as const,
      fingerprintsUsed: false as const,
      rawArgumentsStored: false as const,
      rawResultStored: false as const,
    },
  };
}

describe('external FCR operator relay authority boundary', () => {
  it('advertises implement as a bounded work class without describing mutation authority', () => {
    const tool = externalTools.externalMcpToolDefinitions()
      .find((definition) => definition.name === 'fcr_relay_operator');
    expect(tool).toBeDefined();

    const inputSchema = tool?.inputSchema as {
      properties?: { capability?: { enum?: string[] } };
    };
    expect(inputSchema.properties?.capability?.enum).toEqual([
      'research',
      'propose',
      'review',
      'implement',
    ]);
    expect(String(tool?.description)).toContain('zero mutation authority');
  });

  it('relays implement work through OAuth identity while execution and mutation authority remain false', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        answer: 'Implementation proposal only',
        evidenceRefs: ['provider:anthropic:msg_implement'],
      },
    }));
    const recordEvidence = vi.fn(async (input: { toolName: string }) => (
      receipt(input.toolName as 'fcr_relay_operator')
    ));
    const execute = externalTools.createExternalMcpToolExecutor({
      env: {
        FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ 'chatgpt-client': 'codex' }),
      },
      relayOperator,
      recordEvidence,
    });

    const result = await execute({
      name: 'fcr_relay_operator',
      arguments: {
        targetOperator: 'claude-code',
        capability: 'implement',
        goal: 'Produce the smallest bounded implementation proposal.',
        contextSummary: 'No provider, repository, merge, deploy, or publish authority is granted.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-request-1',
    });

    expect(relayOperator).toHaveBeenCalledWith(expect.objectContaining({
      fromOperator: 'codex',
      toOperator: 'claude-code',
      capability: 'implement',
    }));
    expect(result.governanceBoundary).toEqual(expect.objectContaining({
      externalProviderCall: true,
      mutationAuthority: false,
      executionAllowed: false,
      founderApprovalGranted: false,
    }));
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      risk: 'external_side_effect',
      toolName: 'fcr_relay_operator',
    }));
  });
});
