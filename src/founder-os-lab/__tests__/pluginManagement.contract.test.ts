import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

interface PluginEntry {
  name: string;
  role: string;
  runtimeDiscoveryRequired: boolean;
  defaultMode: 'read-first';
  [key: string]: unknown;
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
  plugins: PluginEntry[];
}

const manifest = JSON.parse(
  await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8'),
) as PluginManagementManifest;

const expectedPlugins = ['GitHub', 'Supabase', 'Slack', 'Asana', 'HubSpot', 'Figma'];
const forbiddenLiveStateKeys = new Set([
  'installed',
  'connected',
  'permission',
  'permissionMode',
  'permission_mode',
  'oauthScopes',
  'token',
  'secret',
]);

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

  it('keeps the active control-room plugin set explicit and runtime-discovered', () => {
    expect(manifest.plugins.map((plugin) => plugin.name)).toEqual(expectedPlugins);
    for (const plugin of manifest.plugins) {
      expect(plugin.role.trim()).not.toBe('');
      expect(plugin.runtimeDiscoveryRequired).toBe(true);
      expect(plugin.defaultMode).toBe('read-first');
      for (const key of Object.keys(plugin)) {
        expect(forbiddenLiveStateKeys.has(key)).toBe(false);
      }
    }
  });
});
