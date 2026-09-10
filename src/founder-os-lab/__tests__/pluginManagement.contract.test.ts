import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

interface PluginEntry {
  name: string;
  role: string;
  runtimeDiscoveryRequired: boolean;
  defaultMode: 'read-first';
}

interface SocialAnalyticsProviderTruth {
  role: string;
  authority: 'secondary';
  runtimeDiscoveryRequired: boolean;
  mayOverrideNativePlatform: false;
  productionAnalyticsApiAssumed?: false;
  emptyRowsMeanZero?: false;
}

interface SocialAnalyticsTruth {
  analyticsMode: 'observation_only';
  sourcePrecedence: string[];
  nativePlatformWinsOnConflict: true;
  emptyProviderRowsClassifyAs: 'UNKNOWN_NO_EVIDENCE';
  causalClaimsRequirePlatformAttributableEvidence: true;
  forbiddenUngroundedClaims: string[];
  buffer: SocialAnalyticsProviderTruth;
  metricool: SocialAnalyticsProviderTruth;
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
  socialAnalyticsTruth: SocialAnalyticsTruth;
  plugins: PluginEntry[];
}

const manifest = JSON.parse(
  await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8'),
) as PluginManagementManifest;

const expectedPlugins = [
  'GitHub',
  'Supabase',
  'Slack',
  'Asana',
  'HubSpot',
  'Figma',
  'Metricool for Social Media',
];
const allowedManifestKeys = [
  'schemaVersion',
  'contract',
  'repository',
  'authorityRepository',
  'controlPlane',
  'runtimeDiscoveryRequired',
  'liveStateStored',
  'writesRequireExplicitUserIntent',
  'writesRequireFreshRepositoryAuthority',
  'permissionStateSource',
  'connectionStateSource',
  'truthBoundary',
  'socialAnalyticsTruth',
  'plugins',
].sort();
const allowedPluginKeys = ['name', 'role', 'runtimeDiscoveryRequired', 'defaultMode'].sort();
const forbiddenLiveStateKeys = new Set([
  'installed',
  'connected',
  'connection',
  'permission',
  'permissions',
  'permissionmode',
  'oauthscopes',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secrets',
]);

function normalizedKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function forbiddenLiveStatePaths(value: unknown, path = 'manifest'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenLiveStatePaths(entry, `${path}[${index}]`));
  }
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
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      contract: 'juss/chatgpt-plugin-management@v1',
      repository: 'jussray/founder-control-room',
      authorityRepository: 'jussray/founder-control-room',
      controlPlane: 'ChatGPT Plugin Management',
      runtimeDiscoveryRequired: true,
      liveStateStored: false,
      writesRequireExplicitUserIntent: true,
      writesRequireFreshRepositoryAuthority: true,
      permissionStateSource: 'chatgpt-runtime',
      connectionStateSource: 'chatgpt-runtime',
    });
    expect(manifest.truthBoundary).toMatch(/does not prove.*installed.*connected.*permitted.*executed/i);
  });

  it('uses a closed manifest schema and rejects live-state keys at any depth', () => {
    expect(Object.keys(manifest).sort()).toEqual(allowedManifestKeys);
    expect(forbiddenLiveStatePaths(manifest)).toEqual([]);
  });

  it('keeps the active control-room plugin set explicit and runtime-discovered', () => {
    expect(manifest.plugins.map((plugin) => plugin.name)).toEqual(expectedPlugins);
    for (const plugin of manifest.plugins) {
      expect(Object.keys(plugin).sort()).toEqual(allowedPluginKeys);
      expect(plugin.role.trim()).not.toBe('');
      expect(plugin.runtimeDiscoveryRequired).toBe(true);
      expect(plugin.defaultMode).toBe('read-first');
    }
  });

  it('keeps social analytics observational and native-platform authoritative', () => {
    expect(manifest.socialAnalyticsTruth).toEqual({
      analyticsMode: 'observation_only',
      sourcePrecedence: [
        'native-platform',
        'native-platform-export',
        'official-api-partner',
        'aggregator',
        'inference',
      ],
      nativePlatformWinsOnConflict: true,
      emptyProviderRowsClassifyAs: 'UNKNOWN_NO_EVIDENCE',
      causalClaimsRequirePlatformAttributableEvidence: true,
      forbiddenUngroundedClaims: [
        'ranking_suppression',
        'distribution_restriction',
        'post_to_follower_conversion',
        'delayed_follower_attribution',
        'algorithmic_cause',
      ],
      buffer: {
        role: 'Corroborating LinkedIn post-level analytics and scheduling when freshly connected through an authorized route.',
        authority: 'secondary',
        runtimeDiscoveryRequired: true,
        mayOverrideNativePlatform: false,
        productionAnalyticsApiAssumed: false,
      },
      metricool: {
        role: 'Secondary cross-network analytics and scheduling observation.',
        authority: 'secondary',
        runtimeDiscoveryRequired: true,
        emptyRowsMeanZero: false,
        mayOverrideNativePlatform: false,
      },
    });
  });
});
