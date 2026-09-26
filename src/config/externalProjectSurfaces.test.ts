import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PORTFOLIO_PROJECTS } from './portfolio.js';

type Binding = {
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

type Manifest = {
  schema: string;
  provider: string;
  authorityRepository: string;
  bindings: Binding[];
};

const publicDir = new URL('../../public/.well-known/', import.meta.url);
const manifestPath = fileURLToPath(new URL('lovable-project-surfaces.json', publicDir));
const schemaPath = fileURLToPath(new URL('lovable-project-surfaces.schema.json', publicDir));
const EXACT_SHA = /^[0-9a-f]{40}$/;

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
}

describe('Lovable external project surface bindings', () => {
  it('binds only to active canonical repositories without granting authority', async () => {
    const data = await readManifest();
    const activeRepositories = new Set(PORTFOLIO_PROJECTS.map((project) => project.repository));
    const ids = new Set<string>();

    expect(data).toMatchObject({
      schema: 'juss/external-project-surfaces@v1',
      provider: 'lovable',
      authorityRepository: 'jussray/founder-control-room',
    });
    expect(data.bindings).toHaveLength(3);

    for (const binding of data.bindings) {
      expect(ids.has(binding.surfaceId)).toBe(false);
      ids.add(binding.surfaceId);
      expect(binding.surfaceId).toMatch(/^lovable:[0-9a-f-]{36}$/);
      expect(activeRepositories.has(binding.canonicalRepository)).toBe(true);
      expect(binding.canonicalBranch).toBe('main');
      expect(binding.surfaceCommit).toMatch(EXACT_SHA);
      expect(binding.truthAuthority).toBe(false);
      expect(binding.executionAllowed).toBe(false);
      expect(binding.externalMutationAllowed).toBe(false);
      expect(binding.rules.length).toBeGreaterThan(0);
    }
  });

  it('keeps each surface in its intended role and quarantines browser-local launch-test state', async () => {
    const data = await readManifest();
    const byName = new Map(data.bindings.map((binding) => [binding.name, binding]));

    expect(byName.get('Truth Compass')).toMatchObject({
      role: 'founder-control-surface',
      canonicalRepository: 'jussray/founder-control-room',
      surfaceState: 'durable-backend-ui-incomplete',
    });
    expect(byName.get('Exact Match Engine')).toMatchObject({
      role: 'reconciliation-prototype',
      canonicalRepository: 'jussray/founder-control-room',
      surfaceCommit: 'e4767d59e6421924565c338f2ba817fd04d0b13b',
      surfaceState: 'browser-local-launch-test',
      truthAuthority: false,
    });
    expect(byName.get('Truth Weaver')).toMatchObject({
      role: 'reasoning-proposal-surface',
      canonicalRepository: 'jussray/chief-ai-machine',
      surfaceState: 'ui-incomplete',
    });
    expect(byName.get('Exact Match Engine')?.rules.join('\n')).toContain(
      'completion receipt alone does not prove user identity',
    );
  });

  it('resolves repository HEAD at use time instead of freezing stale GitHub proof into the surface binding', async () => {
    const raw = await readFile(manifestPath, 'utf8');
    expect(raw).not.toContain('currentRepositoryHead');
    expect(raw).not.toContain('auditedSourceHead');
    expect(raw).toContain('Resolve the current canonical repository head');
  });

  it('keeps the public artifacts bounded and free of obvious credential material', async () => {
    const [manifestRaw, schemaRaw] = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(schemaPath, 'utf8'),
    ]);

    expect(() => JSON.parse(manifestRaw)).not.toThrow();
    expect(() => JSON.parse(schemaRaw)).not.toThrow();
    expect(manifestRaw.length).toBeLessThan(20_000);
    expect(schemaRaw.length).toBeLessThan(20_000);

    for (const marker of ['api_key', 'apikey', 'authorization:', 'bearer ', 'password', 'private_key', 'BEGIN PRIVATE KEY']) {
      expect(manifestRaw.toLowerCase()).not.toContain(marker.toLowerCase());
      expect(schemaRaw.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });

  it('locks authority-bearing schema fields to false', async () => {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
      properties?: { bindings?: { items?: { properties?: Record<string, { const?: unknown }> } } };
    };
    const props = schema.properties?.bindings?.items?.properties;
    expect(props?.truthAuthority?.const).toBe(false);
    expect(props?.executionAllowed?.const).toBe(false);
    expect(props?.externalMutationAllowed?.const).toBe(false);
  });
});
