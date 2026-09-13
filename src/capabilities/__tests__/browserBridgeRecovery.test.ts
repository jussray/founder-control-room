import { describe, expect, it } from 'vitest';

import { decideBrowserBridgeRecovery } from '../browserBridgeRecovery.js';

describe('browser bridge recovery policy', () => {
  it('uses a sufficient direct capability before any browser provider', () => {
    const decision = decideBrowserBridgeRecovery({
      directCapabilitySufficient: true,
      browserOnlyInteractionRequired: true,
      operaConnectorAvailable: true,
      operaLiveSessionExposed: true,
      operaRetryCount: 0,
      providerPageEvidence: 'observed_ready',
      alternateAuthenticatedBridgeAvailable: true,
      alternateAuthenticatedBridgeLive: true,
      genericBrowserAvailable: true,
      genericBrowserSufficient: true,
    });

    expect(decision.route).toBe('direct_capability');
    expect(decision.classification).toBe('READY');
    expect(decision.executionAuthorized).toBe(false);
  });

  it('actively prefers Opera when browser-only work needs a live authenticated session', () => {
    const decision = decideBrowserBridgeRecovery({
      directCapabilitySufficient: false,
      browserOnlyInteractionRequired: true,
      operaConnectorAvailable: true,
      operaLiveSessionExposed: true,
      operaRetryCount: 0,
      providerPageEvidence: 'observed_ready',
      alternateAuthenticatedBridgeAvailable: true,
      alternateAuthenticatedBridgeLive: true,
      genericBrowserAvailable: true,
      genericBrowserSufficient: true,
    });

    expect(decision.route).toBe('opera');
    expect(decision.classification).toBe('READY');
    expect(decision.executionAuthorized).toBe(false);
  });

  it('classifies Browser not connected as a bridge failure without blaming established provider setup', () => {
    const decision = decideBrowserBridgeRecovery({
      directCapabilitySufficient: false,
      browserOnlyInteractionRequired: true,
      operaConnectorAvailable: true,
      operaLiveSessionExposed: false,
      operaConnectorError: 'Browser not connected',
      operaRetryCount: 0,
      providerPageEvidence: 'founder_reported_ready',
      alternateAuthenticatedBridgeAvailable: false,
      alternateAuthenticatedBridgeLive: false,
      genericBrowserAvailable: false,
      genericBrowserSufficient: false,
    });

    expect(decision.route).toBe('blocked_connector_bridge');
    expect(decision.classification).toBe('BLOCKED_CONNECTOR_BRIDGE');
    expect(decision.retryOperaBridge).toBe(true);
    expect(decision.repeatProviderSetupInstructions).toBe(false);
    expect(decision.providerPageEvidencePreserved).toBe(true);
    expect(decision.reason).toMatch(/not proof.*provider page.*logged out|bridge failure/i);
  });

  it('re-probes Opera only once and then stops at the handshake gate', () => {
    const decision = decideBrowserBridgeRecovery({
      directCapabilitySufficient: false,
      browserOnlyInteractionRequired: true,
      operaConnectorAvailable: true,
      operaLiveSessionExposed: false,
      operaConnectorError: 'Browser not connected',
      operaRetryCount: 1,
      providerPageEvidence: 'founder_reported_ready',
      alternateAuthenticatedBridgeAvailable: false,
      alternateAuthenticatedBridgeLive: false,
      genericBrowserAvailable: false,
      genericBrowserSufficient: false,
    });

    expect(decision.classification).toBe('BLOCKED_CONNECTOR_BRIDGE');
    expect(decision.retryOperaBridge).toBe(false);
    expect(decision.repeatProviderSetupInstructions).toBe(false);
    expect(decision.nextGate).toMatch(/live connector handshake gate/i);
  });

  it('falls through to another authenticated bridge before generic automation', () => {
    const decision = decideBrowserBridgeRecovery({
      directCapabilitySufficient: false,
      browserOnlyInteractionRequired: true,
      operaConnectorAvailable: true,
      operaLiveSessionExposed: false,
      operaConnectorError: 'Browser not connected',
      operaRetryCount: 1,
      providerPageEvidence: 'founder_reported_ready',
      alternateAuthenticatedBridgeAvailable: true,
      alternateAuthenticatedBridgeLive: true,
      genericBrowserAvailable: true,
      genericBrowserSufficient: true,
    });

    expect(decision.route).toBe('authenticated_browser_bridge');
    expect(decision.classification).toBe('READY');
    expect(decision.executionAuthorized).toBe(false);
  });
});
