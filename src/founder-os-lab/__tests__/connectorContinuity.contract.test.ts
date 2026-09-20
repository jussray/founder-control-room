import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8'),
) as {
  liveStateStored: boolean;
  connectionStateSource: string;
  connectorBridgeTruth: {
    currentObservationSource: string;
    historicalReceiptSource: string;
    historicalEvidenceIsAppendOnly: boolean;
    currentAbsenceDoesNotEraseHistoricalPresence: boolean;
    currentAndHistoricalMayCoexist: boolean;
    unknownDoesNotMeanNo: boolean;
    staleDoesNotMeanFalse: boolean;
    contradictoryCurrentSignalsClassifyAs: string;
    currentUnavailableClassifyAs: string;
    historicallyVerifiedClassifyAs: string;
    observationRequiresTimestamp: boolean;
    capabilityDimensions: string[];
    installedOrToolSurfacedDoesNotProveLiveSession: boolean;
    connectedClaimRequiresLiveProbe: boolean;
    retryClaimRequiresProbeExecution: boolean;
    canonicalReadOnlyProbeByConnector: Record<string, string>;
    continuityMarkersAreNonAuthorizing: boolean;
    resolutionRule: string;
  };
};

const continuityProtocol = await readFile(
  new URL('../../../docs/CONTINUITY_FINGERPRINT_PROTOCOL.md', import.meta.url),
  'utf8',
);

describe('connector capability continuity contract', () => {
  it('keeps current runtime state separate from append-only historical receipts', () => {
    const truth = manifest.connectorBridgeTruth;

    expect(manifest.liveStateStored).toBe(false);
    expect(manifest.connectionStateSource).toBe('chatgpt-runtime');
    expect(truth.currentObservationSource).toBe('chatgpt-runtime');
    expect(truth.historicalReceiptSource).toBe('evidence-receipts');
    expect(truth.historicalEvidenceIsAppendOnly).toBe(true);
    expect(truth.currentAbsenceDoesNotEraseHistoricalPresence).toBe(true);
    expect(truth.currentAndHistoricalMayCoexist).toBe(true);
    expect(truth.observationRequiresTimestamp).toBe(true);
    expect(truth.continuityMarkersAreNonAuthorizing).toBe(true);
  });

  it('refuses the exact false inference that current absence means historical nonexistence', () => {
    const truth = manifest.connectorBridgeTruth;

    expect(truth.currentUnavailableClassifyAs).toBe('CURRENTLY_UNAVAILABLE');
    expect(truth.historicallyVerifiedClassifyAs).toBe('HISTORICALLY_VERIFIED');
    expect(truth.unknownDoesNotMeanNo).toBe(true);
    expect(truth.staleDoesNotMeanFalse).toBe(true);
    expect(truth.resolutionRule).toMatch(/must never rewrite or delete a verified historical receipt/i);
    expect(truth.resolutionRule).toMatch(/CURRENTLY_UNAVAILABLE/i);
    expect(truth.resolutionRule).toMatch(/HISTORICALLY_VERIFIED/i);
    expect(truth.resolutionRule).toMatch(/UNKNOWN stays UNKNOWN/i);
  });

  it('keeps contradictory connector signals as their own receipt instead of choosing a convenient binary', () => {
    const truth = manifest.connectorBridgeTruth;

    expect(truth.contradictoryCurrentSignalsClassifyAs).toBe('CONNECTOR_STATE_CONFLICT');
    expect(truth.capabilityDimensions).toEqual([
      'catalog-visible',
      'installed',
      'authenticated',
      'callable',
      'readable',
      'writable',
      'execution-success',
    ]);
  });

  it('keeps installed, connected, authorized, and successful execution as separate claims', () => {
    const truth = manifest.connectorBridgeTruth;

    expect(truth.installedOrToolSurfacedDoesNotProveLiveSession).toBe(true);
    expect(truth.connectedClaimRequiresLiveProbe).toBe(true);
    expect(truth.retryClaimRequiresProbeExecution).toBe(true);
    expect(truth.canonicalReadOnlyProbeByConnector).toEqual({ 'Opera Browser Connector': 'list-tabs' });

    for (const invariant of [
      'CURRENTLY_UNAVAILABLE != NEVER_EXISTED',
      'UNKNOWN != NO',
      'STALE != FALSE',
      'INSTALLED != AUTHORIZED',
      'AUTHORIZED != SUCCESSFUL',
      'SUCCESSFUL_ONCE != VERIFIED_NOW',
    ]) {
      expect(continuityProtocol).toContain(invariant);
    }
  });
});
