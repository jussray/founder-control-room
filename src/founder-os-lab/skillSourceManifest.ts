import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const FCR_SKILL_SOURCE_MANIFEST_CONTRACT = 'juss/fcr-skill-source-manifest@v1' as const;

export interface FcrSkillSourceEntryV1 {
  id: string;
  name: string;
  version: string;
  description: string;
  status: string;
  scope: string;
  owner: string;
  sourcePath: string;
  sourceHash: string;
  exposure: {
    fcr: true;
    chief: true;
  };
  mcp: {
    prompt: true;
    resource: true;
    tool: false;
  };
}

export interface FcrSkillSourceManifestV1 {
  contract: typeof FCR_SKILL_SOURCE_MANIFEST_CONTRACT;
  entries: FcrSkillSourceEntryV1[];
  manifestHash: string;
}

const REQUIRED_FRONTMATTER = ['name', 'description', 'version', 'status', 'scope', 'owner'] as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stripScalarQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function parseSkillFrontmatter(source: string): Record<string, string> {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) throw new Error('SKILL.md must start with YAML frontmatter');
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) throw new Error('SKILL.md frontmatter is not closed');

  const result: Record<string, string> = {};
  for (const line of normalized.slice(4, closing).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = stripScalarQuotes(trimmed.slice(separator + 1));
    if (key && value) result[key] = value;
  }

  for (const key of REQUIRED_FRONTMATTER) {
    if (!result[key]?.trim()) throw new Error(`SKILL.md missing required frontmatter: ${key}`);
  }
  return result;
}

function manifestSeed(entries: readonly FcrSkillSourceEntryV1[]): string {
  return JSON.stringify([
    FCR_SKILL_SOURCE_MANIFEST_CONTRACT,
    [...entries]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => [
        entry.id,
        entry.version,
        entry.description,
        entry.status,
        entry.scope,
        entry.owner,
        entry.sourcePath,
        entry.sourceHash,
        [entry.exposure.fcr, entry.exposure.chief],
        [entry.mcp.prompt, entry.mcp.resource, entry.mcp.tool],
      ]),
  ]);
}

export function fcrSkillSourceManifestHash(entries: readonly FcrSkillSourceEntryV1[]): string {
  return sha256(manifestSeed(entries));
}

async function collectSkillFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`skill source path may not be a symlink: ${candidate}`);
    if (entry.isDirectory()) {
      files.push(...await collectSkillFiles(candidate));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(candidate);
    }
  }
  return files;
}

export async function discoverFcrSkillSources(skillsRoot: string): Promise<FcrSkillSourceManifestV1> {
  const canonicalRoot = await realpath(skillsRoot);
  const rootPrefix = `${canonicalRoot}${path.sep}`;
  const files = await collectSkillFiles(canonicalRoot);
  if (files.length === 0) throw new Error('no SKILL.md sources discovered');

  const names = new Set<string>();
  const entries: FcrSkillSourceEntryV1[] = [];

  for (const file of files) {
    const fileStats = await lstat(file);
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) throw new Error(`invalid skill source file: ${file}`);
    const canonicalFile = await realpath(file);
    if (!canonicalFile.startsWith(rootPrefix)) throw new Error(`skill source escaped configured root: ${file}`);

    const source = await readFile(canonicalFile, 'utf8');
    const metadata = parseSkillFrontmatter(source);
    const name = metadata.name.trim();
    if (names.has(name)) throw new Error(`duplicate skill name: ${name}`);
    names.add(name);

    entries.push({
      id: `skill:${name}`,
      name,
      version: metadata.version.trim(),
      description: metadata.description.trim(),
      status: metadata.status.trim(),
      scope: metadata.scope.trim(),
      owner: metadata.owner.trim(),
      sourcePath: path.relative(canonicalRoot, canonicalFile).split(path.sep).join('/'),
      sourceHash: sha256(source),
      exposure: { fcr: true, chief: true },
      mcp: { prompt: true, resource: true, tool: false },
    });
  }

  entries.sort((left, right) => left.id.localeCompare(right.id));
  return {
    contract: FCR_SKILL_SOURCE_MANIFEST_CONTRACT,
    entries,
    manifestHash: fcrSkillSourceManifestHash(entries),
  };
}
