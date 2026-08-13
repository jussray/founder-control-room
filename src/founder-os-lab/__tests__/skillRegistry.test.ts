import { describe, expect, it } from 'vitest';

import {
  buildFounderOsSkillRegistry,
  FCR_SKILL_REGISTRY_CONTRACT,
  fcrSkillRegistryHash,
} from '../skillRegistry.js';

describe('FCR skill registry', () => {
  it('builds a deterministic registry for FCR and Chief', () => {
    const first = buildFounderOsSkillRegistry();
    const second = buildFounderOsSkillRegistry();

    expect(first.contract).toBe(FCR_SKILL_REGISTRY_CONTRACT);
    expect(first.registryHash).toBe(second.registryHash);
    expect(first.entries).toEqual(second.entries);
  });

  it('keeps command and skill identities distinct', () => {
    const registry = buildFounderOsSkillRegistry();
    const ids = registry.entries.map((entry) => entry.id);

    expect(ids).toContain('skill:goalfix');
    expect(ids).toContain('command:goalfix');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes every current entry to both FCR and Chief without executable MCP tools', () => {
    const registry = buildFounderOsSkillRegistry();

    for (const entry of registry.entries) {
      expect(entry.exposure).toEqual({ fcr: true, chief: true });
      expect(entry.mcp.prompt).toBe(true);
      expect(entry.mcp.resource).toBe(true);
      expect(entry.mcp.tool).toBe(false);
    }
  });

  it('changes the registry hash when manifest content changes', () => {
    const registry = buildFounderOsSkillRegistry();
    const changed = registry.entries.map((entry, index) => (
      index === 0 ? { ...entry, role: `${entry.role} changed` } : entry
    ));

    expect(fcrSkillRegistryHash(changed)).not.toBe(registry.registryHash);
  });
});
