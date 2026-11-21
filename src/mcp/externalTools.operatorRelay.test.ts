import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OPERATOR_RELAY_PEERS } from '../lib/operatorRelayConstants.js';
import type { RelayOperatorId } from '../lib/operatorRelay.js';
import { OperatorRelayProviderBoundaryError } from '../lib/operatorRelayProvider.js';
import type { RecordExternalMcpEvidenceInput } from './externalTools.js';

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

function evidenceInput(overrides: Partial<RecordExternalMcpEvidenceInput> = {}) {
  return {
    identity: {
      userId: 'founder-user-1',
      email: 'founder@example.com',
      clientId: 'chatgpt-client',
      authMode: 'oauth' as const,
    },
    requestId: 'relay-evidence-1',
    projectSlug: 'founder-control-room',
    toolName: 'fcr_relay_operator' as const,
    arguments: { goal: 'bounded relay' },
    result: { status: 'failed' },
    durationMs: 12,
    risk: 'external_side_effect' as const,
    ...overrides,
  };
}

describe('external MCP durable evidence rows', () => {
  it('persists failed relay truth and bounded failure metadata', () => {
    const row = externalTools.buildExternalMcpEvidenceRow('project-row-1', evidenceInput({
      outcomeStatus: 'failed',
      failure: {
        code: 'provider boundary failed with spaces',
        provider: 'anthropic/messages',
        externalProviderCall: true,
      },
    }));

    expect(row).toMatchObject({
      project_id: 'project-row-1',
      status: 'failed',
      risk: 'external_side_effect',
      response_summary: {
        rawResultStored: false,
        failure: {
          code: 'provider_boundary_failed_with_spaces',
          provider: 'anthropic_messages',
          externalProviderCall: true,
        },
      },
    });
  });

  it('keeps ordinary successful evidence passed without invented failure metadata', () => {
    const row = externalTools.buildExternalMcpEvidenceRow('project-row-1', evidenceInput({
      outcomeStatus: 'passed',
      result: { ok: true },
      failure: undefined,
    }));

    expect(row.status).toBe('passed');
    expect(row.response_summary).not.toHaveProperty('failure');
  });
});

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


describe('external relay provider-call receipts', () => {
  const identity = {
    userId: 'founder-user-1',
    email: 'founder@example.com',
    clientId: 'chatgpt-client',
    authMode: 'oauth' as const,
  };
  const args = {
    targetOperator: 'claude-code',
    capability: 'implement',
    goal: 'Return bounded implementation evidence.',
    contextSummary: 'No mutation, merge, deploy, or publish authority.',
    sensitivity: 'internal',
  };

  it('keeps a successful non-provider relay read-only when no provider evidence exists', async () => {
    const relayOperator = vi.fn(async (input: RelayCall) => ({
      request: input,
      response: {
        fromOperator: input.toOperator,
        toOperator: input.fromOperator,
        answer: 'blocked locally',
        evidenceRefs: ['local:policy:block'],
      },
    }));
    const recordEvidence = vi.fn(async (_input: unknown) => receipt('fcr_relay_operator'));
    const execute = externalTools.createExternalMcpToolExecutor({
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ 'chatgpt-client': 'codex' }) },
      relayOperator,
      recordEvidence,
    });

    const result = await execute({
      name: 'fcr_relay_operator',
      arguments: args,
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'relay-non-provider-success',
    });

    expect(result.governanceBoundary).toMatchObject({ externalProviderCall: false });
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      risk: 'read',
      result: expect.objectContaining({
        response: expect.objectContaining({ evidenceRefs: ['local:policy:block'] }),
      }),
    }));
  });

  it('records a sanitized external-provider failure receipt before rethrowing', async () => {
    const marker = 'provider-secret-detail-marker';
    const relayOperator = vi.fn(async () => {
      throw new OperatorRelayProviderBoundaryError('anthropic', marker);
    });
    const recordEvidence = vi.fn(async (_input: unknown) => receipt('fcr_relay_operator'));
    const execute = externalTools.createExternalMcpToolExecutor({
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ 'chatgpt-client': 'codex' }) },
      relayOperator,
      recordEvidence,
    });

    await expect(execute({
      name: 'fcr_relay_operator',
      arguments: args,
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'relay-provider-failure',
    })).rejects.toBeInstanceOf(OperatorRelayProviderBoundaryError);

    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      risk: 'external_side_effect',
      outcomeStatus: 'failed',
      failure: {
        code: 'provider_boundary_failure',
        provider: 'anthropic',
        externalProviderCall: true,
      },
      result: {
        contract: 'fcr/operator-relay-failure@v1',
        status: 'failed',
        targetOperator: 'claude-code',
        externalProviderCall: true,
        provider: 'anthropic',
        code: 'provider_boundary_failure',
      },
    }));
    expect(JSON.stringify(recordEvidence.mock.calls[0]?.[0] ?? '')).not.toContain(marker);
  });

  it('records pre-provider relay failures as read risk without inventing provider activity', async () => {
    const marker = 'pre-provider-secret-detail-marker';
    const relayOperator = vi.fn(async () => {
      throw new Error(marker);
    });
    const recordEvidence = vi.fn(async (_input: unknown) => receipt('fcr_relay_operator'));
    const execute = externalTools.createExternalMcpToolExecutor({
      env: { FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP: JSON.stringify({ 'chatgpt-client': 'codex' }) },
      relayOperator,
      recordEvidence,
    });

    await expect(execute({
      name: 'fcr_relay_operator',
      arguments: args,
      allowedProjects: new Set(['founder-control-room']),
      identity,
      requestId: 'relay-pre-provider-failure',
    })).rejects.toThrow(marker);

    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      risk: 'read',
      outcomeStatus: 'failed',
      failure: {
        code: 'relay_failed_before_provider',
        provider: undefined,
        externalProviderCall: false,
      },
      result: {
        contract: 'fcr/operator-relay-failure@v1',
        status: 'failed',
        targetOperator: 'claude-code',
        externalProviderCall: false,
        code: 'relay_failed_before_provider',
      },
    }));
    expect(JSON.stringify(recordEvidence.mock.calls[0]?.[0] ?? '')).not.toContain(marker);
  });
});
