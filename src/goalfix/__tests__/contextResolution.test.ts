import { describe, expect, it } from 'vitest';
import {
  GOALFIX_AUTO_STOP_CONDITION,
  GoalfixContextResolutionError,
  parseGoalfixVerificationManifest,
  repositoryIdentityMatches,
  resolveGoalfixProjectHint,
  type GoalfixProjectCandidate,
} from '../contextResolution.js';

const PROJECTS: GoalfixProjectCandidate[] = [
  {
    id: 'jbh-public',
    slug: 'juss-beautiful-hair',
    name: 'Juss Beautiful Hair',
    repo_provider: 'github',
    repo_identifier: 'jussray/jussbeautifulhair-site',
  },
  {
    id: 'jbh-private',
    slug: 'juss-beautiful-hair-private',
    name: 'Juss Beautiful Hair — Private Control',
    repo_provider: 'github',
    repo_identifier: 'jussray/jbh-private',
  },
  {
    id: 'bip',
    slug: 'sekret-bip',
    name: "Se'kret Bip",
    repo_provider: 'github',
    repo_identifier: 'jussray/Sekret-Bip',
  },
  {
    id: 'fcr',
    slug: 'founder-control-room',
    name: 'Founder Control Room',
    repo_provider: 'github',
    repo_identifier: 'jussray/founder-control-room',
  },
];

function workflowManifest(repository = 'jussray/Sekret-Bip') {
  return JSON.stringify({
    repository,
    tests: {
      workflowCatalog: [
        { id: 'truth', name: 'Repository Truth Gate', required: true, status: 'active' },
        { id: 'browser', name: 'Product Design Playwright Proof', required: true, status: 'active' },
        { id: 'production', name: 'Verify Cloudflare Native Deployment', required: true, status: 'main-only' },
        { id: 'founder', name: 'Control Room Manifest', required: true, status: 'founder-gated' },
        { id: 'old', name: 'Retired Proof', required: true, status: 'retired' },
        { id: 'advisory', name: 'Advisory', required: false, status: 'active' },
      ],
    },
  });
}

function catalogManifest(repository = 'jussray/chief-ai-machine') {
  return JSON.stringify({
    repository,
    tests: {
      catalog: [
        { id: 'typecheck', name: 'Chief AI TypeScript', required: true, status: 'active' },
        { id: 'unit-tests', name: 'Chief AI unit tests', required: true, status: 'active' },
        { id: 'playwright', name: 'Freestyle save and persistence Chromium proof', required: true, status: 'active' },
      ],
    },
  });
}

describe('resolveGoalfixProjectHint', () => {
  it('resolves founder shorthand without collapsing the two JBH repositories', () => {
    expect(resolveGoalfixProjectHint(PROJECTS, 'JBH')).toEqual({
      status: 'resolved',
      project: PROJECTS[0],
    });
    expect(resolveGoalfixProjectHint(PROJECTS, 'jbh-private')).toEqual({
      status: 'resolved',
      project: PROJECTS[1],
    });
  });

  it('resolves canonical names, acronyms, repo leaves, and unique project words', () => {
    expect(resolveGoalfixProjectHint(PROJECTS, 'FCR')).toMatchObject({ status: 'resolved', project: { slug: 'founder-control-room' } });
    expect(resolveGoalfixProjectHint(PROJECTS, 'jussbeautifulhair-site')).toMatchObject({ status: 'resolved', project: { slug: 'juss-beautiful-hair' } });
    expect(resolveGoalfixProjectHint(PROJECTS, 'Bip')).toMatchObject({ status: 'resolved', project: { slug: 'sekret-bip' } });
  });

  it('fails closed when a shorthand matches multiple projects at the same authority score', () => {
    const ambiguous = resolveGoalfixProjectHint([
      ...PROJECTS,
      {
        id: 'other-bip',
        slug: 'other-bip',
        name: 'Another Bip',
        repo_provider: 'github',
        repo_identifier: 'jussray/other-bip',
      },
    ], 'Bip');

    expect(ambiguous.status).toBe('ambiguous');
    if (ambiguous.status === 'ambiguous') expect(ambiguous.candidates).toHaveLength(2);
  });

  it('does not invent a project when no registered identity matches', () => {
    expect(resolveGoalfixProjectHint(PROJECTS, 'Bip Jr')).toEqual({ status: 'not_found', candidates: [] });
  });
});

describe('parseGoalfixVerificationManifest', () => {
  it('derives the required proof set from tests.workflowCatalog on the default branch', () => {
    expect(parseGoalfixVerificationManifest(workflowManifest(), 'jussray/Sekret-Bip', 'main', 'main')).toEqual({
      manifestRepository: 'jussray/Sekret-Bip',
      requiredVerificationNames: [
        'Repository Truth Gate',
        'Product Design Playwright Proof',
        'Verify Cloudflare Native Deployment',
        'Control Room Manifest',
      ],
    });
  });

  it('accepts the established portfolio tests.catalog dialect without forcing manifest rewrites', () => {
    expect(parseGoalfixVerificationManifest(
      catalogManifest(),
      'jussray/chief-ai-machine',
      'main',
      'main',
    )).toEqual({
      manifestRepository: 'jussray/chief-ai-machine',
      requiredVerificationNames: [
        'Chief AI TypeScript',
        'Chief AI unit tests',
        'Freestyle save and persistence Chromium proof',
      ],
    });
  });

  it('unions both authoritative catalog dialects when a repository exposes both', () => {
    const combined = JSON.stringify({
      repository: 'jussray/founder-control-room',
      tests: {
        workflowCatalog: [
          { id: 'ci', name: 'CI', required: true, status: 'active' },
          { id: 'shared', name: 'Shared Proof', required: true, status: 'active' },
        ],
        catalog: [
          { id: 'playwright', name: 'Playwright E2E', required: true, status: 'active' },
          { id: 'shared-duplicate', name: 'Shared Proof', required: true, status: 'active' },
        ],
      },
    });

    expect(parseGoalfixVerificationManifest(
      combined,
      'jussray/founder-control-room',
      'main',
      'main',
    ).requiredVerificationNames).toEqual(['CI', 'Shared Proof', 'Playwright E2E']);
  });

  it('does not require a main-only lane on a non-default ref', () => {
    expect(parseGoalfixVerificationManifest(workflowManifest(), 'jussray/Sekret-Bip', 'feature/test', 'main').requiredVerificationNames)
      .toEqual(['Repository Truth Gate', 'Product Design Playwright Proof', 'Control Room Manifest']);
  });

  it('fails closed when manifest identity does not match the registered repository', () => {
    expect(() => parseGoalfixVerificationManifest(workflowManifest('jussray/wrong-repo'), 'jussray/Sekret-Bip', 'main', 'main'))
      .toThrowError(GoalfixContextResolutionError);
    try {
      parseGoalfixVerificationManifest(workflowManifest('jussray/wrong-repo'), 'jussray/Sekret-Bip', 'main', 'main');
    } catch (error) {
      expect((error as GoalfixContextResolutionError).code).toBe('GOALFIX_REPOSITORY_IDENTITY_MISMATCH');
    }
  });

  it('fails closed when neither authoritative catalog dialect is present', () => {
    const noCatalog = JSON.stringify({ repository: 'jussray/Sekret-Bip', tests: {} });
    expect(() => parseGoalfixVerificationManifest(noCatalog, 'jussray/Sekret-Bip', 'main', 'main'))
      .toThrowError(GoalfixContextResolutionError);
  });

  it('normalizes equivalent GitHub repository identities without treating them as authority', () => {
    expect(repositoryIdentityMatches('jussray/Sekret-Bip', 'https://github.com/jussray/sekret-bip.git')).toBe(true);
  });
});

describe('automatic GoalFix stop condition', () => {
  it('is a fixed fail-closed policy rather than a model-generated project guess', () => {
    expect(GOALFIX_AUTO_STOP_CONDITION).toContain('Stop before mutation');
    expect(GOALFIX_AUTO_STOP_CONDITION).toContain('founder approval');
  });
});
