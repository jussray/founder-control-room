import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverFcrSkillSources,
  FCR_SKILL_SOURCE_MANIFEST_CONTRACT,
  parseSkillFrontmatter,
} from '../skillSourceManifest.js';

const REPOSITORY_SKILLS_ROOT = fileURLToPath(new URL('../../../.agents/skills/', import.meta.url));
const temporaryRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fcr-skill-source-'));
  temporaryRoots.push(root);
  return root;
}

function skillSource(name: string, description = 'Example skill'): string {
  return `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0\nstatus: active\nscope: founder-control-room\nowner: Juss\n---\n\n# ${name}\n\nBody.\n`;
}

function importedSkillSource(name: string): string {
  return `---\nname: ${name}\ndescription: Imported provider skill\n---\n\n# ${name}\n`;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FCR skill source manifest', () => {
  it('discovers real founder-owned SKILL.md sources with deterministic hashes', async () => {
    const manifest = await discoverFcrSkillSources(REPOSITORY_SKILLS_ROOT);

    expect(manifest.contract).toBe(FCR_SKILL_SOURCE_MANIFEST_CONTRACT);
    expect(manifest.entries.length).toBeGreaterThan(0);
    expect(new Set(manifest.entries.map((entry) => entry.id)).size).toBe(manifest.entries.length);
    expect(manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.entries.map((entry) => entry.id)).not.toContain('skill:agents-sdk');
    for (const entry of manifest.entries) {
      expect(entry.owner.toLowerCase()).toBe('juss');
      expect(entry.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sourcePath.endsWith('SKILL.md')).toBe(true);
      expect(entry.exposure).toEqual({ fcr: true, chief: true });
      expect(entry.mcp).toEqual({ prompt: true, resource: true, tool: false });
    }
  });

  it('skips imported skills that are not explicitly founder-owned', async () => {
    const root = await tempRoot();
    const ownedDirectory = path.join(root, 'owned');
    const importedDirectory = path.join(root, 'vendor');
    await mkdir(ownedDirectory);
    await mkdir(importedDirectory);
    await writeFile(path.join(ownedDirectory, 'SKILL.md'), skillSource('owned'), 'utf8');
    await writeFile(path.join(importedDirectory, 'SKILL.md'), importedSkillSource('vendor'), 'utf8');

    const manifest = await discoverFcrSkillSources(root);
    expect(manifest.entries.map((entry) => entry.id)).toEqual(['skill:owned']);
  });

  it('changes source and manifest hashes when founder-owned SKILL.md content changes', async () => {
    const root = await tempRoot();
    const skillDirectory = path.join(root, 'alpha');
    await mkdir(skillDirectory);
    const skillPath = path.join(skillDirectory, 'SKILL.md');
    await writeFile(skillPath, skillSource('alpha'), 'utf8');

    const first = await discoverFcrSkillSources(root);
    await writeFile(skillPath, skillSource('alpha', 'Changed description'), 'utf8');
    const second = await discoverFcrSkillSources(root);

    expect(second.entries[0].sourceHash).not.toBe(first.entries[0].sourceHash);
    expect(second.manifestHash).not.toBe(first.manifestHash);
  });

  it('rejects duplicate founder-owned skill identities', async () => {
    const root = await tempRoot();
    for (const directory of ['one', 'two']) {
      const skillDirectory = path.join(root, directory);
      await mkdir(skillDirectory);
      await writeFile(path.join(skillDirectory, 'SKILL.md'), skillSource('duplicate'), 'utf8');
    }

    await expect(discoverFcrSkillSources(root)).rejects.toThrow('duplicate skill name: duplicate');
  });

  it('rejects symlinked skill source paths', async () => {
    const root = await tempRoot();
    const target = path.join(root, 'target');
    await mkdir(target);
    await writeFile(path.join(target, 'SKILL.md'), skillSource('target'), 'utf8');
    await symlink(target, path.join(root, 'linked'));

    await expect(discoverFcrSkillSources(root)).rejects.toThrow('may not be a symlink');
  });

  it('fails closed when founder-owned frontmatter is incomplete', async () => {
    const root = await tempRoot();
    const skillDirectory = path.join(root, 'owned');
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, 'SKILL.md'),
      '---\nname: incomplete\ndescription: Incomplete\nowner: Juss\n---\n\n# Incomplete\n',
      'utf8',
    );

    await expect(discoverFcrSkillSources(root)).rejects.toThrow(
      'owned/SKILL.md: SKILL.md missing required frontmatter: version',
    );
  });

  it('keeps the strict parser available for explicit founder-owned validation', () => {
    expect(() => parseSkillFrontmatter('---\nname: incomplete\n---\n\n# Incomplete\n')).toThrow(
      'SKILL.md missing required frontmatter: description',
    );
  });
});
