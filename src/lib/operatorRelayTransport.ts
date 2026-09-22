import type { OperatorRelayAdapter } from './operatorRelayDispatch.js';
import type { RelayOperatorId } from './operatorRelay.js';
import { buildOperatorRelayResponse } from './operatorRelayProviderResult.js';

export type OperatorRelayTransport =
  | 'provider_api'
  | 'remote_mcp'
  | 'local_mcp'
  | 'interactive_browser';

export interface OperatorRelayTransportAvailability {
  providerApi: boolean;
  remoteMcpHandoff: boolean;
  localMcpHandoff: boolean;
  interactiveBrowserHandoff: boolean;
}

export interface OperatorRelayTransportResolution {
  transport: OperatorRelayTransport | 'unavailable';
  mode: 'direct' | 'handoff' | 'unavailable';
  completionVerified: false;
  reason: string;
}

const HANDOFF_TRANSPORTS: readonly OperatorRelayTransport[] = [
  'remote_mcp',
  'local_mcp',
  'interactive_browser',
];

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'enabled';
}

function envStem(operator: RelayOperatorId): string {
  if (operator === 'gemini') return 'GEMINI';
  if (operator === 'codex') return 'OPENAI';
  if (operator === 'claude-code') return 'ANTHROPIC';
  return 'PERPLEXITY';
}

export function operatorRelayTransportAvailability(
  operator: RelayOperatorId,
  providerApi: boolean,
  env: NodeJS.ProcessEnv = process.env,
): OperatorRelayTransportAvailability {
  const stem = envStem(operator);
  return {
    providerApi,
    remoteMcpHandoff: enabled(env[`FCR_RELAY_${stem}_REMOTE_MCP_HANDOFF`]),
    localMcpHandoff: enabled(env[`FCR_RELAY_${stem}_LOCAL_MCP_HANDOFF`]),
    interactiveBrowserHandoff: enabled(env[`FCR_RELAY_${stem}_INTERACTIVE_BROWSER_HANDOFF`]),
  };
}

export function resolveOperatorRelayTransport(
  availability: OperatorRelayTransportAvailability,
): OperatorRelayTransportResolution {
  if (availability.providerApi) {
    return {
      transport: 'provider_api',
      mode: 'direct',
      completionVerified: false,
      reason: 'provider API credentials and model configuration are available',
    };
  }
  if (availability.remoteMcpHandoff) {
    return {
      transport: 'remote_mcp',
      mode: 'handoff',
      completionVerified: false,
      reason: 'provider API unavailable; remote MCP handoff is allowed',
    };
  }
  if (availability.localMcpHandoff) {
    return {
      transport: 'local_mcp',
      mode: 'handoff',
      completionVerified: false,
      reason: 'provider API unavailable; local MCP handoff is allowed',
    };
  }
  if (availability.interactiveBrowserHandoff) {
    return {
      transport: 'interactive_browser',
      mode: 'handoff',
      completionVerified: false,
      reason: 'provider API unavailable; user-authorized interactive browser handoff is allowed',
    };
  }
  return {
    transport: 'unavailable',
    mode: 'unavailable',
    completionVerified: false,
    reason: 'no provider API or explicitly authorized handoff transport is available',
  };
}

export function operatorRelayHandoffAdapter(
  resolution: OperatorRelayTransportResolution,
): OperatorRelayAdapter {
  if (resolution.mode !== 'handoff' || !HANDOFF_TRANSPORTS.includes(resolution.transport as OperatorRelayTransport)) {
    throw new Error('operator relay handoff adapter requires a handoff transport');
  }
  return async (request) => buildOperatorRelayResponse(request, {
    status: 'blocked',
    answer:
      `Relay transport ${resolution.transport} requires completion outside the server provider API path. `
      + 'Do not mark the relay completed until a real peer response is returned and bound to this exact request hash.',
    unresolved: [
      `relay_transport:${resolution.transport}`,
      'relay_transport_not_yet_executed',
      `relay_request_hash:${request.requestHash}`,
    ],
  });
}
