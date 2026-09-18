import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./vaultHub.js', () => ({
  hubForMcpProject: vi.fn(),
}));
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {},
}));

type ExternalToolsModule = typeof import('./externalTools.js');
type RelayCall = {
  fromOperator: 'codex' | 'claude-code' | 'perplexity';
  toOperator: 'codex' | 'claude-code' | 'perplexity';
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

function receipt() {
  return {
    contract: 'founder-control-room/external-mcp-receipt@v1' as const,
    id: 'relay-blocked-receipt-1',
    projectSlug: 'founder-control-room',
    toolName: 'fcr_relay_operator' as const,
    requestHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    createdAt: '2026-09-17T23:30:00.000Z',
    privacy: {
      cookiesUsed: false as const,
      fingerprintsUsed: false as const,
      rawArgumentsStored: false as const,
      rawResultStored: false as const,
    },
  };
}

describe('external FCR operator relay handoff truth', () => {
  it('does not report a blocked non-API handoff as an external provider call', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        status: 'blocked',
        answer: 'Interactive handoff has not executed.',
        evidenceRefs: [],
        unresolved: [
          'relay_transport:interactive_browser',
          'relay_transport_not_yet_executed',
        ],
      },
    }));
    const recordEvidence = vi.fn(async () => receipt());
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
        capability: 'review',
        goal: 'Review the bounded proposal.',
        contextSummary: 'No provider API call has occurred; only an interactive handoff is available.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-blocked-request-1',
    });

    expect(result.governanceBoundary).toEqual(expect.objectContaining({
      readOrPreviewOnly: true,
      externalProviderCall: false,
      mutationAuthority: false,
      executionAllowed: false,
      founderApprovalGranted: false,
    }));
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      risk: 'read',
      toolName: 'fcr_relay_operator',
    }));
  });

  it('keeps a provider-bound response classified as an external provider call', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        status: 'completed',
        answer: 'Provider-bound review result.',
        evidenceRefs: ['provider:anthropic:model:claude-test:response:msg_safe'],
        unresolved: [],
      },
    }));
    const recordEvidence = vi.fn(async () => receipt());
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
        capability: 'review',
        goal: 'Review the bounded proposal.',
        contextSummary: 'A provider API response is returned through the canonical relay.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-provider-request-1',
    });

    expect(result.governanceBoundary).toEqual(expect.objectContaining({
      readOrPreviewOnly: false,
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
