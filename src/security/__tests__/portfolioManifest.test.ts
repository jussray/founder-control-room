import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const registry = JSON.parse(
  readFileSync(`${root}control-room/portfolio-registry.json`, 'utf8'),
) as {
  schemaVersion: string;
  observedAt: string;
  policy: {
    portfolioHub: string;
    manifestPath: string;
    rawPrivateContentAllowed: boolean;
    statusWithoutEvidence: string;
    productionMutationRequiresSeparateFounderGate: boolean;
  };
  projects: Array<{
    repository: string;
    role: string;
    observedCommit: string;
    manifestState: string;
    status: string;
    riskLevel: string;
  }>;
};

const hubManifest = JSON.parse(
  readFileSync(`${root}control-room.manifest.json`, 'utf8'),
) as Record<string, unknown>;

const expectedRepositories = [
  'jussray/Sekret-Bip',
  'jussray/chief-ai-machine',
  'jussray/founder-control-room',
  'jussray/jussbeautifulhair-site',
  'jussray/l99-',
  'jussray/sekret-bip-demo',
  'jussray/untold-stories-storefront',
];

describe('portfolio Control Room contract', () => {
  it('registers exactly the active portfolio repositories', () => {
    expect(registry.schemaVersion).toBe('1.0');
    expect(registry.projects.map((item) => item.repository).sort()).toEqual(
      expectedRepositories,
    );
  });

  it('requires sanitized read-only observation outside the hub', () => {
    expect(registry.policy.portfolioHub).toBe('jussray/founder-control-room');
    expect(registry.policy.manifestPath).toBe('control-room.manifest.json');
    expect(registry.policy.rawPrivateContentAllowed).toBe(false);
    expect(registry.policy.statusWithoutEvidence).toBe('blocked');
    expect(registry.policy.productionMutationRequiresSeparateFounderGate).toBe(true);
  });

  it('uses immutable commit evidence and non-empty risk posture', () => {
    for (const project of registry.projects) {
      expect(project.observedCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(project.manifestState).toBe('proposed');
      expect(project.status.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(project.riskLevel);
    }
  });

  it('defines the standalone repository as the portfolio authority', () => {
    expect(hubManifest).toMatchObject({
      schemaVersion: '1.0',
      repository: 'jussray/founder-control-room',
      portfolioHub: 'jussray/founder-control-room',
      role: 'portfolio-control-plane',
    });

    const authority = hubManifest.authority as Record<string, unknown>;
    const controlRoom = hubManifest.controlRoom as Record<string, unknown>;
    expect(authority.portfolioMode).toBe('authoritative-index');
    expect(authority.productionMutation).toBe('separate-founder-gate');
    expect(controlRoom.privateContentAllowed).toBe(false);
  });
});
