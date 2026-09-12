import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

interface PluginEntry {
  name: string;
  role: string;
  runtimeDiscoveryRequired: boolean;
  defaultMode: 'read-first';
}

interface WriteProofTruth {
  connectionDoesNotProveWriteAuthority: boolean;
  capabilityDiscoveryDoesNotProveAccountAuthority: boolean;
  accountAuthorityDoesNotProveExecution: boolean;
  providerAcceptanceDoesNotProveOutcome: boolean;
  writeCapabilityClassifyUntilProviderAcceptance: 'UNKNOWN_WRITE_AUTHORITY';
  successfulWriteRequires: string[];
  verifiedOutcomeAdditionallyRequires: 'outcome-evidence';
  forbiddenGraduations: string[];
}

interface ConnectorBridgeTruth {
  evidencePlanes: ['connector-surface', 'live-session', 'provider-page'];
  bridgeBlockedClassifyAs: 'BLOCKED_CONNECTOR_BRIDGE';
  providerPageStateSurvivesBridgeFailure: boolean;
  repeatProviderSetupWithoutProviderEvidence: boolean;
  blockedStateInvalidatedBy: string[];
  continuityMarkersAreNonAuthorizing: boolean;
  installedOrToolSurfacedDoesNotProveLiveSession: boolean;
  connectedClaimRequiresLiveProbe: boolean;
  retryClaimRequiresProbeExecution: boolean;
  canonicalReadOnlyProbeByConnector: Record<string, string>;
  recoveryRule: string;
}

interface EvidenceSourceTruth {
  providerReadFailureClassifyAs: 'BLOCKED_SOURCE_ACCESS';
  providerReadFailureDoesNotEraseAlternateEvidence: boolean;
  providerNotFoundDoesNotProveArtifactAbsent: boolean;
  userProvidedArtifactMaySatisfyEquivalentEvidenceNeed: boolean;
  sourceSpecificBlockMayNotFreezeMissionWhenEquivalentEvidenceExists: boolean;
  alternateEvidenceMustRetainOwnProvenance: boolean;
  continuityMarkersAreNonAuthorizing: boolean;
  recoveryRule: string;
}

interface SocialAnalyticsTruth {
  analyticsMode: 'observation_only';
  learningRequiresVerifiedPostLevelMeasurement: boolean;
  nativeMeasurementSatisfiesLearningGate: boolean;
  secondarySensorFailureMayBlockVerifiedNativeMeasurement: boolean;
  paidSecondarySensorRequired: boolean;
  publishedWithoutMeasurementClassifyAs: 'UNMEASURED';
  sourcePrecedence: string[];
  nativePlatformWinsOnConflict: boolean;
  emptyProviderRowsClassifyAs: 'UNKNOWN_NO_EVIDENCE';
  causalClaimsRequirePlatformAttributableEvidence: boolean;
  forbiddenUngroundedClaims: string[];
  linkedinNative: { role: string; authority: 'primary'; runtimeDiscoveryRequired: boolean };
  cambiante: { role: string; authority: 'secondary'; runtimeDiscoveryRequired: boolean; requiredLinkedInPermission: 'r_member_postAnalytics'; missingPermissionClassifyAs: 'BLOCKED_PROVIDER_SCOPE'; mayOverrideNativePlatform: boolean };
  buffer: { role: string; authority: 'secondary'; runtimeDiscoveryRequired: boolean; mayOverrideNativePlatform: boolean; productionAnalyticsApiAssumed: boolean };
  metricool: { role: string; authority: 'secondary'; runtimeDiscoveryRequired: boolean; emptyRowsMeanZero: boolean; historicalBackfillAssumed: boolean; mayOverrideNativePlatform: boolean };
}

interface PluginManagementManifest {
  schemaVersion: number;
  contract: string;
  repository: string;
  authorityRepository: string;
  controlPlane: string;
  runtimeDiscoveryRequired: boolean;
  liveStateStored: boolean;
  writesRequireExplicitUserIntent: boolean;
  writesRequireFreshRepositoryAuthority: boolean;
  permissionStateSource: string;
  connectionStateSource: string;
  truthBoundary: string;
  writeProofTruth: WriteProofTruth;
  connectorBridgeTruth: ConnectorBridgeTruth;
  evidenceSourceTruth: EvidenceSourceTruth;
  socialAnalyticsTruth: SocialAnalyticsTruth;
  plugins: PluginEntry[];
}

const manifest = JSON.parse(await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8')) as PluginManagementManifest;

const expectedPlugins = ['GitHub','Google Drive','Supabase','Slack','Asana','HubSpot','Figma','LinkedIn','Cambiante: Content Manager','Metricool for Social Media','Opera Browser Connector'];
const allowedManifestKeys = ['schemaVersion','contract','repository','authorityRepository','controlPlane','runtimeDiscoveryRequired','liveStateStored','writesRequireExplicitUserIntent','writesRequireFreshRepositoryAuthority','permissionStateSource','connectionStateSource','truthBoundary','writeProofTruth','connectorBridgeTruth','evidenceSourceTruth','socialAnalyticsTruth','plugins'].sort();
const allowedPluginKeys = ['name','role','runtimeDiscoveryRequired','defaultMode'].sort();
const forbiddenLiveStateKeys = new Set(['installed','connected','connection','permission','permissions','permissionmode','oauthscopes','token','accesstoken','refreshtoken','secret','secrets']);
function normalizedKey(key: string): string { return key.replace(/[_-]/g, '').toLowerCase(); }
function forbiddenLiveStatePaths(value: unknown, path = 'manifest'): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => forbiddenLiveStatePaths(entry, `${path}[${index}]`));
  if (value === null || typeof value !== 'object') return [];
  const failures: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenLiveStateKeys.has(normalizedKey(key))) failures.push(childPath);
    failures.push(...forbiddenLiveStatePaths(child, childPath));
  }
  return failures;
}

describe('ChatGPT plugin management repository contract', () => {
  it('declares intent without claiming live ChatGPT state', () => {
    expect(manifest).toMatchObject({schemaVersion:1,contract:'juss/chatgpt-plugin-management@v1',repository:'jussray/founder-control-room',authorityRepository:'jussray/founder-control-room',controlPlane:'ChatGPT Plugin Management',runtimeDiscoveryRequired:true,liveStateStored:false,writesRequireExplicitUserIntent:true,writesRequireFreshRepositoryAuthority:true,permissionStateSource:'chatgpt-runtime',connectionStateSource:'chatgpt-runtime'});
    expect(manifest.truthBoundary).toMatch(/does not prove.*installed.*connected.*permitted.*write-authorized.*executed.*outcome/i);
  });

  it('uses a closed manifest schema and rejects live-state keys at any depth', () => {
    expect(Object.keys(manifest).sort()).toEqual(allowedManifestKeys);
    expect(forbiddenLiveStatePaths(manifest)).toEqual([]);
  });

  it('never graduates connection or discovery into write proof', () => {
    expect(manifest.writeProofTruth).toMatchObject({
      connectionDoesNotProveWriteAuthority: true,
      capabilityDiscoveryDoesNotProveAccountAuthority: true,
      accountAuthorityDoesNotProveExecution: true,
      providerAcceptanceDoesNotProveOutcome: true,
      writeCapabilityClassifyUntilProviderAcceptance: 'UNKNOWN_WRITE_AUTHORITY',
      verifiedOutcomeAdditionallyRequires: 'outcome-evidence',
    });
    expect(manifest.writeProofTruth.successfulWriteRequires).toEqual(['explicit-founder-intent','live-target-identity','fresh-write-authority','exact-final-payload','provider-acceptance-receipt']);
    expect(manifest.writeProofTruth.forbiddenGraduations).toEqual(['connected=>write-capable','tool-supports-write=>account-can-write','provider-accepted=>outcome-verified']);
  });

  it('separates connector-bridge truth from provider-page truth and fails closed', () => {
    expect(manifest.connectorBridgeTruth.evidencePlanes).toEqual(['connector-surface','live-session','provider-page']);
    expect(manifest.connectorBridgeTruth.bridgeBlockedClassifyAs).toBe('BLOCKED_CONNECTOR_BRIDGE');
    expect(manifest.connectorBridgeTruth.providerPageStateSurvivesBridgeFailure).toBe(true);
    expect(manifest.connectorBridgeTruth.repeatProviderSetupWithoutProviderEvidence).toBe(false);
    expect(manifest.connectorBridgeTruth.blockedStateInvalidatedBy).toEqual(['live-session-exposed','stronger-contradictory-bridge-evidence']);
    expect(manifest.connectorBridgeTruth.continuityMarkersAreNonAuthorizing).toBe(true);
    expect(manifest.connectorBridgeTruth.installedOrToolSurfacedDoesNotProveLiveSession).toBe(true);
    expect(manifest.connectorBridgeTruth.connectedClaimRequiresLiveProbe).toBe(true);
    expect(manifest.connectorBridgeTruth.retryClaimRequiresProbeExecution).toBe(true);
    expect(manifest.connectorBridgeTruth.canonicalReadOnlyProbeByConnector).toEqual({'Opera Browser Connector':'list-tabs'});
    expect(manifest.connectorBridgeTruth.recoveryRule).toMatch(/Browser not connected/i);
    expect(manifest.connectorBridgeTruth.recoveryRule).toMatch(/does not prove a live browser session/i);
    expect(manifest.connectorBridgeTruth.recoveryRule).toMatch(/Claim a retry only when the live read-only probe actually executes/i);
    expect(manifest.connectorBridgeTruth.recoveryRule).toMatch(/do not blame or reset the page/i);
    expect(manifest.connectorBridgeTruth.recoveryRule).toMatch(/fresh bridge evidence/i);
  });

  it('preserves equivalent evidence when one provider source is unreadable', () => {
    expect(manifest.evidenceSourceTruth.providerReadFailureClassifyAs).toBe('BLOCKED_SOURCE_ACCESS');
    expect(manifest.evidenceSourceTruth.providerReadFailureDoesNotEraseAlternateEvidence).toBe(true);
    expect(manifest.evidenceSourceTruth.providerNotFoundDoesNotProveArtifactAbsent).toBe(true);
    expect(manifest.evidenceSourceTruth.userProvidedArtifactMaySatisfyEquivalentEvidenceNeed).toBe(true);
    expect(manifest.evidenceSourceTruth.sourceSpecificBlockMayNotFreezeMissionWhenEquivalentEvidenceExists).toBe(true);
    expect(manifest.evidenceSourceTruth.alternateEvidenceMustRetainOwnProvenance).toBe(true);
    expect(manifest.evidenceSourceTruth.continuityMarkersAreNonAuthorizing).toBe(true);
    expect(manifest.evidenceSourceTruth.recoveryRule).toMatch(/Google Drive 404/i);
    expect(manifest.evidenceSourceTruth.recoveryRule).toMatch(/blocks only that source/i);
    expect(manifest.evidenceSourceTruth.recoveryRule).toMatch(/continue from that evidence/i);
  });

  it('keeps social analytics fail-closed and provider bounded', () => {
    expect(manifest.socialAnalyticsTruth.analyticsMode).toBe('observation_only');
    expect(manifest.socialAnalyticsTruth.learningRequiresVerifiedPostLevelMeasurement).toBe(true);
    expect(manifest.socialAnalyticsTruth.nativeMeasurementSatisfiesLearningGate).toBe(true);
    expect(manifest.socialAnalyticsTruth.secondarySensorFailureMayBlockVerifiedNativeMeasurement).toBe(false);
    expect(manifest.socialAnalyticsTruth.paidSecondarySensorRequired).toBe(false);
    expect(manifest.socialAnalyticsTruth.publishedWithoutMeasurementClassifyAs).toBe('UNMEASURED');
    expect(manifest.socialAnalyticsTruth.sourcePrecedence).toEqual(['native-platform','native-platform-export','official-api-partner','aggregator','inference']);
    expect(manifest.socialAnalyticsTruth.nativePlatformWinsOnConflict).toBe(true);
    expect(manifest.socialAnalyticsTruth.emptyProviderRowsClassifyAs).toBe('UNKNOWN_NO_EVIDENCE');
    expect(manifest.socialAnalyticsTruth.linkedinNative.authority).toBe('primary');
    expect(manifest.socialAnalyticsTruth.cambiante.requiredLinkedInPermission).toBe('r_member_postAnalytics');
    expect(manifest.socialAnalyticsTruth.cambiante.missingPermissionClassifyAs).toBe('BLOCKED_PROVIDER_SCOPE');
    expect(manifest.socialAnalyticsTruth.cambiante.mayOverrideNativePlatform).toBe(false);
    expect(manifest.socialAnalyticsTruth.metricool.emptyRowsMeanZero).toBe(false);
    expect(manifest.socialAnalyticsTruth.metricool.historicalBackfillAssumed).toBe(false);
    expect(manifest.socialAnalyticsTruth.metricool.mayOverrideNativePlatform).toBe(false);
  });

  it('keeps the active control-room plugin set explicit and runtime-discovered', () => {
    expect(manifest.plugins.map((plugin) => plugin.name)).toEqual(expectedPlugins);
    for (const plugin of manifest.plugins) {
      expect(Object.keys(plugin).sort()).toEqual(allowedPluginKeys);
      expect(plugin.role.trim()).not.toBe('');
      expect(plugin.runtimeDiscoveryRequired).toBe(true);
      expect(plugin.defaultMode).toBe('read-first');
    }
    const drive = manifest.plugins.find((plugin) => plugin.name === 'Google Drive');
    expect(drive?.role).toMatch(/BLOCKED_SOURCE_ACCESS/);
    expect(drive?.role).toMatch(/must not erase equivalent uploaded/i);
    const opera = manifest.plugins.find((plugin) => plugin.name === 'Opera Browser Connector');
    expect(opera?.role).toMatch(/separate evidence planes/i);
    expect(opera?.role).toMatch(/BLOCKED_CONNECTOR_BRIDGE/);
  });
});
