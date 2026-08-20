import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAppAwareRepositoryProvider } = vi.hoisted(() => ({
  mockCreateAppAwareRepositoryProvider: vi.fn(),
}));

vi.mock('../../providers/RepositoryProviderFactory.js', () => ({
  createAppAwareRepositoryProvider: mockCreateAppAwareRepositoryProvider,
}));

import { revalidateCurrentProjectMain } from '../currentMainRevalidation.js';

const REPOSITORY = 'jussray/Sekret-Bip';
const SHA = '1234567890abcdef1234567890abcdef12345678';

function githubProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: 'github',
    getProject: vi.fn().mockResolvedValue({
      defaultBranch: 'main',
      locator: REPOSITORY,
    }),
    resolveRef: vi.fn().mockResolvedValue(SHA),
    ...overrides,
  };
}

describe('current-main read-through revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the enrolled GitHub main branch immediately before Current Truth projection', async () => {
    const provider = githubProvider();
    mockCreateAppAwareRepositoryProvider.mockResolvedValue(provider);

    const result = await revalidateCurrentProjectMain({
      slug: 'sekret-bip',
      repo_provider: 'github',
      repo_identifier: REPOSITORY,
    });

    expect(mockCreateAppAwareRepositoryProvider).toHaveBeenCalledWith({
      slug: 'sekret-bip',
      repoProvider: 'github',
      repoIdentifier: REPOSITORY,
    });
    expect(provider.getProject).toHaveBeenCalledWith('sekret-bip');
    expect(provider.resolveRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(result).toMatchObject({
      repository: REPOSITORY,
      branch: 'main',
      commitSha: SHA,
      provider: 'github',
    });
    expect(Number.isFinite(Date.parse(result.observedAt))).toBe(true);
  });

  it('fails closed for a non-main branch, mismatched locator, or non-exact SHA', async () => {
    mockCreateAppAwareRepositoryProvider
      .mockResolvedValueOnce(githubProvider({
        getProject: vi.fn().mockResolvedValue({ defaultBranch: 'trunk', locator: REPOSITORY }),
      }))
      .mockResolvedValueOnce(githubProvider({
        getProject: vi.fn().mockResolvedValue({ defaultBranch: 'main', locator: 'other/repo' }),
      }))
      .mockResolvedValueOnce(githubProvider({ resolveRef: vi.fn().mockResolvedValue('not-a-sha') }));

    const connection = {
      slug: 'sekret-bip',
      repo_provider: 'github',
      repo_identifier: REPOSITORY,
    };

    await expect(revalidateCurrentProjectMain(connection))
      .rejects.toThrow('project_repository_main_identity_mismatch');
    await expect(revalidateCurrentProjectMain(connection))
      .rejects.toThrow('project_repository_main_identity_mismatch');
    await expect(revalidateCurrentProjectMain(connection))
      .rejects.toThrow('project_repository_main_sha_invalid');
  });
});
