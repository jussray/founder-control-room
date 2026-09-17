import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PORTFOLIO_PROJECTS } from './portfolio.js';

type SurfaceBinding = {
  surfaceId: string;
  name: string;
  role: string;
  canonicalRepository: string;
  canonicalBranch: string;
  surfaceCommit: string;
  surfaceState: string;
  truthAuthority: boolean;
  executionAllowed: boolean;
  externalMutationAllowed: boolean;
  rules: string[];
};

type SurfaceManifest = {
  schema: string;
  provider: string;
  authorityRepository: string;
  bindings: SurfaceBinding[];
};

const EXACT_SHA = /^[0-9a-f]{40}$/;
const manifestPath = fileURLToPath(
  new URL('../../public/.well-known/lovable-project-surfaces.json', import.meta.url),
);

async function manifest(): Promise<SurfaceManifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as SurfaceManifest;
}

describe('Lovable external project surface bindings', () => {
  it('binds only to active canonical repositories without adding surface authority', async () => {
    const data = await manifest();
    const activeRepositories = new Set(PORTFOLIO_PROJECTS.map((project) => project.repository));

    expect(data.schema).toBe('juss/external-project-surfaces@v1');
    expect(data.provider).toBe('lovable');
    expect(data.authorityRepository).toBe('jussray/founder-control-room');
    expect(data.bindings).toHaveLength(3);

    for (const binding of data.bindings) {
      expect(binding.surfaceId).toMatch(/^lovable:[0-9a-f-]{36}$/);
      expect(binding.canonicalBranch).toBe('main');
      expect(activeRepositories.has(binding.canonicalRepository)).toBe(true);
      expect(binding.surfaceCommit).toMatch(EXACT_SHA);
      expect(binding.truthAuthority).toBe(false);
      expect(binding.executionAllowed).toBe(false);
      expect(binding.externalMutationAllowed).toBe(false);
      expect(binding.rules.length).toBeGreaterThan(0);
    }
  });

  it('keeps the presentation, reconciliation, and reasoning surfaces in separate non-authoritative roles', async () => {
    const data = await manifest();
    const byName = new Map(data.bindings.map((binding) => [binding.name, binding]));

    expect(byName.get('Truth Compass')).toMatchObject({
      role: 'founder-control-surface',
      canonicalRepository: 'jussray/founder-control-room',
      surfaceState: 'durable-backend-ui-incomplete',
    });
    expect(byName.get('Exact Match Engine')).toMatchObject({
      role: 'reconciliation-prototype',
      canonicalRepository: 'jussray/founder-control-room',
      surfaceState: 'browser-local-demo',
    });
    expect(byName.get('Truth Weaver')).toMatchObject({
      role: 'reasoning-proposal-surface',
      canonicalRepository: 'jussray/chief-ai-machine',
      surfaceState: 'ui-incomplete',
    });
  });

  it('does not freeze a canonical repository head into the external-surface manifest', async () => {
    const raw = await readFile(manifestPath, 'utf8');
    expect(raw).not.toContain('currentRepositoryHead');
    expect(raw).not.toContain('auditedSourceHead');
    expect(raw).toContain('Resolve the current canonical repository head');
  });

  it('keeps browser-local demo evidence from being represented as portfolio truth', async () => {
    const data = await manifest();
    const exactMatch = data.bindings.find((binding) => binding.name === 'Exact Match Engine');

    expect(exactMatch?.surfaceState).toBe('browser-local-demo');
    expect(exactMatch?.rules.join('\n')).toContain('seeded state is demo evidence only');
    expect(exactMatch?.truthAuthority).toBe(false);
  });
});
