import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerForProjectMock } = vi.hoisted(() => ({
  providerForProjectMock: vi.fn(),
}));

vi.mock('../../providers/providerFactory.js', () => ({
  providerForProject: providerForProjectMock,
}));

import type { RepositoryProvider } from '../../providers/RepositoryProvider.js';
import {
  GOVERNED_EXECUTION_SCHEMA,
  type GovernedExecutionLease,
} from '../../ultrathink-core/governedExecution.js';
import {
  REPOSITORY_READ_CAPABILITY,
  REPOSITORY_READ_TOOL,
  repositoryReadSubjectFingerprint,
  repositoryReadSubjectLocator,
  runGovernedRepositoryRead,
  type RepositoryReadBrokerWorld,
} from '../repositoryReadAttempt.js';

const REPOSITORY = 'jussray/founder-control-room';
const PROJECT_ID = 'founder-control-room';
const REF = 'main';
const PATH = 'README.md';
const SHA = '1'.repeat(40);
const MOVED_SHA = '2'.repeat(40);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

function lease(overrides: Partial<GovernedExecutionLease> = {}): GovernedExecutionLease {
  const base: GovernedExecutionLease = {
    schema: GOVERNED_EXECUTION_SCHEMA,
    authority: {
      id: 'lease-repository-read-1',
      subject: REPOSITORY_READ_TOOL,
      consequence: 'execute',
      evidenceIds: ['evidence-repository-read-1'],
      issuedAt: '2026-09-07T19:00:00.000Z',
      expiresAt: '2026-09-07T21:00:00.000Z',
      binding: {
        repository: REPOSITORY,
        headSha: SHA,
        policyHash: HASH_A,
        actor: 'jussray',
      },
    },
    principal: {
      actorId: 'jussray',
      workspaceId: 'fcr',
      projectId: PROJECT_ID,
    },
    subject: {
      locator: repositoryReadSubjectLocator(REPOSITORY, REF, PATH),
      expectedVersion: SHA,
      fingerprint: repositoryReadSubjectFingerprint(REPOSITORY, REF, PATH),
    },
    capabilities: [REPOSITORY_READ_CAPABILITY],
    forbiddenCapabilities: ['*.write', 'process.spawn', 'provider.*.mutate'],
    runtime: {
      harnessId: 'openclaw-compatible',
      harnessVersion: 'v0',
      runtimeGenerationHash: HASH_B,
      providerId: 'github',
      modelId: 'none',
      pluginSetHash: HASH_C,
    },
    authoritySnapshot: {
      capabilityManifestHash: HASH_A,
      resourceManifestHash: HASH_B,
      adapterRegistryHash: HASH_D,
    },
    execution: {
      idempotencyKey: 'repository-read-1',
      maxAttempts: 1,
    },
    reversibility: 'reversible',
  };

  return { ...base, ...overrides };
}

function world(overrides: Partial<RepositoryReadBrokerWorld> = {}): RepositoryReadBrokerWorld {
  return {
    authorityWorld: {
      policyHash: HASH_A,
      actor: 'jussray',
      now: '2026-09-07T20:00:00.000Z',
    },
    principal: {
      actorId: 'jussray',
      workspaceId: 'fcr',
      projectId: PROJECT_ID,
    },
    runtime: {
      harnessId: 'openclaw-compatible',
      harnessVersion: 'v0',
      runtimeGenerationHash: HASH_B,
      providerId: 'github',
      modelId: 'none',
      pluginSetHash: HASH_C,
    },
    authoritySnapshot: {
      capabilityManifestHash: HASH_A,
      resourceManifestHash: HASH_B,
      adapterRegistryHash: HASH_D,
    },
    attempt: 1,
    leaseConsumed: false,
    previousOutcome: 'none',
    ...overrides,
  };
}

function proposal() {
  return {
    toolName: REPOSITORY_READ_TOOL,
    requestedCapabilities: [REPOSITORY_READ_CAPABILITY],
  };
}

function input(overrides: Partial<Parameters<typeof runGovernedRepositoryRead>[0]> = {}) {
  return {
    lease: lease(),
    world: world(),
    proposal: proposal(),
    repository: REPOSITORY,
    projectId: PROJECT_ID,
    ref: REF,
    path: PATH,
    ...overrides,
  };
}

function fakeProvider(options: {
  sha?: string;
  content?: string;
  resolveError?: Error;
  readError?: Error;
} = {}): RepositoryProvider {
  const resolveRef = vi.fn(async () => {
    if (options.resolveError) throw options.resolveError;
    return options.sha ?? SHA;
  });
  const readFile = vi.fn(async () => {
    if (options.readError) throw options.readError;
    return options.content ?? '# Founder Control Room\n';
  });

  return {
    name: 'github',
    resolveRef,
    readFile,
  } as unknown as RepositoryProvider;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T20:00:00.000Z'));
  providerForProjectMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runGovernedRepositoryRead', () => {
  it('releases content only after a fresh FCR-owned provider readback verifies the same ref and bytes', async () => {
    const executionProvider = fakeProvider({ content: '# Stable\n' });
    const readbackProvider = fakeProvider({ content: '# Stable\n' });
    providerForProjectMock
      .mockReturnValueOnce(executionProvider)
      .mockReturnValueOnce(readbackProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('VERIFIED');
    expect(result.output).toMatchObject({
      repository: REPOSITORY,
      projectId: PROJECT_ID,
      ref: REF,
      commitSha: SHA,
      path: PATH,
      content: '# Stable\n',
    });
    expect(result.output?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.witness).toMatchObject({ status: 'verified', strength: 'W1' });
    expect(result.witness?.evidenceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(executionProvider.resolveRef).toHaveBeenCalledWith(PROJECT_ID, REF);
    expect(executionProvider.readFile).toHaveBeenCalledWith(PROJECT_ID, SHA, PATH);
    expect(readbackProvider.resolveRef).toHaveBeenCalledWith(PROJECT_ID, REF);
    expect(readbackProvider.readFile).toHaveBeenCalledWith(PROJECT_ID, SHA, PATH);
    expect(providerForProjectMock).toHaveBeenCalledTimes(2);
    expect(providerForProjectMock).toHaveBeenNthCalledWith(1, {
      repo_provider: 'github',
      slug: PROJECT_ID,
      repo_identifier: REPOSITORY,
    });
  });

  it('withholds content when the mutable ref moves before verification', async () => {
    const executionProvider = fakeProvider({ content: '# First\n' });
    const readbackProvider = fakeProvider({ sha: MOVED_SHA, content: '# Second\n' });
    providerForProjectMock
      .mockReturnValueOnce(executionProvider)
      .mockReturnValueOnce(readbackProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('CONTRADICTED');
    expect(result.output).toBeUndefined();
    expect(result.reason).toContain('ref moved');
    expect(readbackProvider.readFile).not.toHaveBeenCalled();
  });

  it('withholds content when the provider returns different bytes for the same immutable commit', async () => {
    const executionProvider = fakeProvider({ content: '# First\n' });
    const readbackProvider = fakeProvider({ content: '# Different\n' });
    providerForProjectMock
      .mockReturnValueOnce(executionProvider)
      .mockReturnValueOnce(readbackProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('CONTRADICTED');
    expect(result.output).toBeUndefined();
    expect(result.reason).toContain('content is withheld');
  });

  it('keeps execution unverified and withholds content when FCR readback is unavailable', async () => {
    const executionProvider = fakeProvider({ content: '# First\n' });
    const readbackProvider = fakeProvider({ resolveError: new Error('provider down') });
    providerForProjectMock
      .mockReturnValueOnce(executionProvider)
      .mockReturnValueOnce(readbackProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('EXECUTED_UNVERIFIED');
    expect(result.output).toBeUndefined();
    expect(result.reason).toContain('readback failed');
  });

  it('refuses repository or project substitution before constructing any provider', async () => {
    const result = await runGovernedRepositoryRead(input({
      repository: 'jussray/other-repo',
      projectId: 'other-project',
    }));

    expect(result.state).toBe('DENIED');
    expect(result.output).toBeUndefined();
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('refuses tool or capability substitution before constructing any provider', async () => {
    const result = await runGovernedRepositoryRead(input({
      proposal: {
        toolName: 'repository.listFiles',
        requestedCapabilities: [REPOSITORY_READ_CAPABILITY, 'process.spawn'],
      },
    }));

    expect(result.state).toBe('DENIED');
    expect(result.decision.reasons).toEqual(['repository_read_proposal_mismatch']);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('denies a ref that no longer matches the exact commit bound into the lease before reading content', async () => {
    const executionProvider = fakeProvider({ sha: MOVED_SHA, content: '# Moved\n' });
    providerForProjectMock.mockReturnValueOnce(executionProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('DENIED');
    expect(result.output).toBeUndefined();
    expect(result.decision.reasons).toContain('authority:head_drift');
    expect(result.decision.reasons).toContain('subject_version_drift');
    expect(executionProvider.readFile).not.toHaveBeenCalled();
    expect(providerForProjectMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the first provider read exceeds the bounded output size', async () => {
    const executionProvider = fakeProvider({ content: 'x'.repeat((256 * 1024) + 1) });
    providerForProjectMock.mockReturnValueOnce(executionProvider);

    const result = await runGovernedRepositoryRead(input());

    expect(result.state).toBe('ATTEMPT_FAILED');
    expect(result.output).toBeUndefined();
    expect(providerForProjectMock).toHaveBeenCalledTimes(1);
  });

  it('rejects path traversal before provider access', async () => {
    const result = await runGovernedRepositoryRead(input({ path: '../secret.txt' }));

    expect(result.state).toBe('DENIED');
    expect(result.output).toBeUndefined();
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });
});
