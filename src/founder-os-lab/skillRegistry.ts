import { createHash } from 'node:crypto';

import { FOUNDER_OS_LAB_COMMANDS, FOUNDER_OS_LAB_SKILLS } from './registry.js';

export const FCR_SKILL_REGISTRY_CONTRACT = 'juss/fcr-skill-registry@v1' as const;

export interface FcrSkillManifestEntryV1 {
  id: string;
  version: string;
  kind: 'skill' | 'command';
  role: string;
  exposure: {
    fcr: boolean;
    chief: boolean;
  };
  mcp: {
    prompt: boolean;
    resource: boolean;
    tool: false;
  };
}

export interface FcrSkillRegistryV1 {
  contract: typeof FCR_SKILL_REGISTRY_CONTRACT;
  entries: FcrSkillManifestEntryV1[];
  registryHash: string;
}

function sortedEntries(entries: readonly FcrSkillManifestEntryV1[]): FcrSkillManifestEntryV1[] {
  return [...entries].sort((left, right) => left.id.localeCompare(right.id));
}

export function fcrSkillRegistrySeed(entries: readonly FcrSkillManifestEntryV1[]): string {
  return JSON.stringify([
    FCR_SKILL_REGISTRY_CONTRACT,
    sortedEntries(entries).map((entry) => [
      entry.id,
      entry.version,
      entry.kind,
      entry.role.trim(),
      [entry.exposure.fcr, entry.exposure.chief],
      [entry.mcp.prompt, entry.mcp.resource, entry.mcp.tool],
    ]),
  ]);
}

export function fcrSkillRegistryHash(entries: readonly FcrSkillManifestEntryV1[]): string {
  return createHash('sha256').update(fcrSkillRegistrySeed(entries), 'utf8').digest('hex');
}

export function buildFounderOsSkillRegistry(): FcrSkillRegistryV1 {
  const skills: FcrSkillManifestEntryV1[] = FOUNDER_OS_LAB_SKILLS.map((entry) => ({
    id: `skill:${entry.id}`,
    version: '1',
    kind: 'skill',
    role: entry.role,
    exposure: { fcr: true, chief: true },
    mcp: { prompt: true, resource: true, tool: false },
  }));

  const commands: FcrSkillManifestEntryV1[] = FOUNDER_OS_LAB_COMMANDS.map((entry) => ({
    id: `command:${entry.id}`,
    version: '1',
    kind: 'command',
    role: entry.role,
    exposure: { fcr: true, chief: true },
    mcp: { prompt: true, resource: true, tool: false },
  }));

  const entries = sortedEntries([...skills, ...commands]);
  return {
    contract: FCR_SKILL_REGISTRY_CONTRACT,
    entries,
    registryHash: fcrSkillRegistryHash(entries),
  };
}
