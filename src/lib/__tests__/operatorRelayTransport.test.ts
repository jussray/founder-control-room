import { describe, expect, it } from 'vitest';
import {
  operatorRelayHandoffAdapter,
  operatorRelayTransportAvailability,
  resolveOperatorRelayTransport,
} from '../operatorRelayTransport.js';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Return a bounded independent review.';
  const sourceRef = 'chat:transport-test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-transport-test',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'Independent review',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: '2026-09-16T06:30:00.000Z',
    expiresAt: '2099-09-16T06:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('operator relay transport resolution', () => {
  it('prefers provider API when it is configured', () => {
    expect(resolveOperatorRelayTransport({
      providerApi: true,
      remoteMcpHandoff: true,
      localMcpHandoff: true,
      interactiveBrowserHandoff: true,
    }).transport).toBe('provider_api');
  });

  it('falls through in the approved remote -> local -> interactive order', () => {
    expect(resolveOperatorRelayTransport({
      providerApi: false,
      remoteMcpHandoff: true,
      localMcpHandoff: true,
      interactiveBrowserHandoff: true,
    }).transport).toBe('remote_mcp');
    expect(resolveOperatorRelayTransport({
      providerApi: false,
      remoteMcpHandoff: false,
      localMcpHandoff: true,
      interactiveBrowserHandoff: true,
    }).transport).toBe('local_mcp');
    expect(resolveOperatorRelayTransport({
      providerApi: false,
      remoteMcpHandoff: false,
      localMcpHandoff: false,
      interactiveBrowserHandoff: true,
    }).transport).toBe('interactive_browser');
  });

  it('does not infer browser availability without explicit authorization', () => {
    const availability = operatorRelayTransportAvailability('perplexity', false, {});
    expect(availability.interactiveBrowserHandoff).toBe(false);
    expect(resolveOperatorRelayTransport(availability).transport).toBe('unavailable');
  });

  it('returns a blocked handoff bound to the exact request rather than faking completion', async () => {
    const resolution = resolveOperatorRelayTransport({
      providerApi: false,
      remoteMcpHandoff: false,
      localMcpHandoff: false,
      interactiveBrowserHandoff: true,
    });
    const response = await operatorRelayHandoffAdapter(resolution)(relay());
    expect(response.status).toBe('blocked');
    expect(response.evidenceRefs).toEqual([]);
    expect(response.unresolved).toContain('relay_transport:interactive_browser');
    expect(response.unresolved).toContain(`relay_request_hash:${relay().requestHash}`);
    expect(response.authorityRequested).toBe('none');
  });
});
