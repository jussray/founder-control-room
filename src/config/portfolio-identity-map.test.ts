import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTINUITY_ONLY_PROJECTS,
  EXTERNAL_PROJECTS,
  PORTFOLIO_PROJECTS,
  QUARANTINED_REPOSITORIES,
} from './portfolio.js';

type Carrier = [platform: string, id: string, relationship: string];

type Identity = {
  slug: string;
  name: string;
  role: string;
  status: string;
  authorityAliases?: string[];
  carriers: Carrier[];
};

type IdentityMap = {
  schemaVersion: number;
  authority: string;
  identities: Identity[];
  quarantinedGithub: string[];
  unresolvedCarriers: Array<[platform: string, id: string, reason: string]>;
};

const map = JSON.parse(
  readFileSync(new URL('../../config/portfolio-identity-map.json', import.meta.url), 'utf8'),
) as IdentityMap;

const carrierKey = ([platform, id]: Carrier | [string, string, string]) => `${platform}:${id}`.toLowerCase();

describe('portfolio identity map', () => {
  it('is explicitly non-authorizing', () => {
    expect(map.schemaVersion).toBe(1);
    expect(map.authority).toContain('non-authorizing');
  });

  it('keeps canonical slugs and carrier identities unique', () => {
    const slugs = map.identities.map((identity) => identity.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const carriers = map.identities.flatMap((identity) => identity.carriers.map(carrierKey));
    expect(new Set(carriers).size).toBe(carriers.length);
  });

  it('covers every FCR-known repository identity without expanding authority', () => {
    const mappedSlugs = new Set(
      map.identities.flatMap((identity) => [identity.slug, ...(identity.authorityAliases ?? [])]),
    );
    const mappedGithub = new Set(
      map.identities
        .flatMap((identity) => identity.carriers)
        .filter(([platform]) => platform === 'github')
        .map((carrier) => carrier[1].toLowerCase()),
    );

    for (const project of [...PORTFOLIO_PROJECTS, ...EXTERNAL_PROJECTS, ...CONTINUITY_ONLY_PROJECTS]) {
      expect(mappedSlugs.has(project.slug)).toBe(true);
      expect(mappedGithub.has(project.repository.toLowerCase())).toBe(true);
    }
  });

  it('mirrors the repository quarantine set exactly', () => {
    expect([...map.quarantinedGithub].sort()).toEqual([...QUARANTINED_REPOSITORIES].sort());
  });

  it('keeps unresolved carriers out of canonical identity assignments', () => {
    const canonical = new Set(map.identities.flatMap((identity) => identity.carriers.map(carrierKey)));
    for (const carrier of map.unresolvedCarriers) {
      expect(canonical.has(carrierKey(carrier))).toBe(false);
      expect(carrier[2].length).toBeGreaterThan(0);
    }
  });

  it('keeps Protect Me models distinct from FCR and explicitly scoped', () => {
    const one = map.identities.find((item) => item.slug === 'juss-protect-me');
    const two = map.identities.find((item) => item.slug === 'juss-protect-me-2');
    expect(one?.role).toBe('independent-personal-security-system');
    expect(two?.role).toBe('independent-infrastructure-security-system');
    expect(one?.status).toBe('deployed-preview');
    expect(two?.status).toBe('deployed-limited-scope');
    expect(one?.carriers).toContainEqual(['web', 'protect.jussco.company', 'public-worker-front-door']);
    expect(two?.carriers).toContainEqual(['web', 'protect2.jussco.company', 'worker-scoped-edge-shield']);
    expect(map.unresolvedCarriers.some(([, id]) =>
      ['jussray/juss-protect-me', 'jussray/juss-protect-me-2'].includes(id))).toBe(false);
  });
});
