import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OPERATOR_RELAY_PEERS } from '../lib/operatorRelayConstants.js';
import type { RelayOperatorId } from '../lib/operatorRelay.js';

vi.mock('./vaultHub.js', () => ({
  hubForMcpProject: vi.fn(),
}));
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {},
}));

type ExternalToolsModule = typeof import('./externalTools.js');
type RelayCall = {
  fromOperator: RelayOperatorId;
  toOperator: RelayOperatorId;
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
  it('advertises the canonical peer set plus bounded work classes without mutation authority', () => {
    const tool = externalTools.externalMcpToolDefinitions()
      .find((definition) => definition.name === 'fcr_relay_operator');
    expect(tool).toBeDefined();

    const inputSchema = tool?.inputSchema as {
      properties?: {
        targetOperator?: { enum?: string[] };
        capability?: { enum?: string[] };
      };
    };
    expect(inputSchema.properties?.targetOperator?.enum).toEqual([...OPERATOR_RELAY_PEERS]);
    expect(inputSchema.properties?.capability?.enum).toEqual([
      'research',
      'propose',
      'review',
      'implement',
    ]);
    expect(String(tool?.description)).toContain('canonical peer operator');
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

  it('routes the public Gemini target through the same bounded relay without granting execution authority', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        answer: 'Gemini media command proposal',
        evidenceRefs: ['provider:gemini:gemini-media-command-1'],
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
        targetOperator: 'gemini',
        capability: 'implement',
        goal: 'Plan the governed media route.',
        contextSummary: 'Gemini is operational command authority only. /LEEVIZE remains the non-bypassable truth and policy kernel.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-request-gemini-1',
    });

    expect(relayOperator).toHaveBeenCalledWith(expect.objectContaining({
      fromOperator: 'codex',
      toOperator: 'gemini',
      capability: 'implement',
    }));
    expect(result.governanceBoundary).toEqual(expect.objectContaining({
      externalProviderCall: true,
      mutationAuthority: false,
      executionAllowed: false,
      founderApprovalGranted: false,
    }));
  });

  it('routes DeepSeek as a peer while keeping DeepSeek Instructor out of the relay lane', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        answer: 'DeepSeek bounded peer result',
        evidenceRefs: ['provider:deepseek:resp_ds_1'],
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

    await execute({
      name: 'fcr_relay_operator',
      arguments: {
        targetOperator: 'deepseek',
        capability: 'research',
        goal: 'Attack the bounded claim and return attributable evidence.',
        contextSummary: 'Peer mode only. Instructor mode remains a separate operator identity.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-request-deepseek-1',
    });

    expect(relayOperator).toHaveBeenCalledWith(expect.objectContaining({
      fromOperator: 'codex',
      toOperator: 'deepseek',
      capability: 'research',
    }));

    await expect(execute({
      name: 'fcr_relay_operator',
      arguments: {
        targetOperator: 'deepseek-instructor',
        capability: 'research',
        goal: 'This should be rejected.',
        contextSummary: 'Instructor identity is not a peer relay target.',
        sensitivity: 'internal',
      },
      allowedProjects: new Set(['founder-control-room']),
      identity: {
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        authMode: 'oauth',
      },
      requestId: 'relay-request-deepseek-instructor-1',
    })).rejects.toThrow('targetOperator is not a peer relay operator');
  });
});
