import { describe, expect, it, vi } from 'vitest';
import { GitHubProvider } from '../GitHubProvider.js';

const HEAD = 'a'.repeat(40);
const MOVED = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const FILE = 'd'.repeat(40);
const COMMIT = 'e'.repeat(40);

function fixture(currentHead: string) {
  const provider = new GitHubProvider({
    token: 'non-live-test-only',
    projectMap: { 'test-project': 'jussray/test-project' },
  });
  const getBranch = vi.fn().mockResolvedValue({
    data: { commit: { sha: currentHead, commit: { tree: { sha: TREE } } } },
  });
  const createBlob = vi.fn().mockResolvedValue({ data: { sha: FILE } });
  const createTree = vi.fn().mockResolvedValue({ data: { sha: TREE } });
  const createCommit = vi.fn().mockResolvedValue({ data: { sha: COMMIT } });
  const updateRef = vi.fn().mockResolvedValue({ data: { ref: 'refs/heads/mission/test' } });

  const octokit = (provider as unknown as {
    octokit: {
      repos: { getBranch: typeof getBranch };
      git: {
        createBlob: typeof createBlob;
        createTree: typeof createTree;
        createCommit: typeof createCommit;
        updateRef: typeof updateRef;
      };
    };
  }).octokit;
  octokit.repos.getBranch = getBranch;
  octokit.git.createBlob = createBlob;
  octokit.git.createTree = createTree;
  octokit.git.createCommit = createCommit;
  octokit.git.updateRef = updateRef;
  return { provider, getBranch, createBlob, createCommit, updateRef };
}

const patch = {
  message: 'Apply exact staged edit',
  authorName: 'founder-control-room',
  expectedHeadSha: HEAD,
  changes: [{ path: 'src/example.ts', content: 'export const value = true;' }],
};

describe('GitHubProvider staged mission patch head guard', () => {
  it('rejects head movement before creating any Git objects or writing a ref', async () => {
    const { provider, createBlob, createCommit, updateRef } = fixture(MOVED);
    await expect(provider.commitPatch('test-project', 'mission/test', patch))
      .rejects.toThrow(/exact branch head changed before commit/);
    expect(createBlob).not.toHaveBeenCalled();
    expect(createCommit).not.toHaveBeenCalled();
    expect(updateRef).not.toHaveBeenCalled();
  });

  it('uses the existing non-force commit path when the exact head matches', async () => {
    const { provider, createBlob, createCommit, updateRef } = fixture(HEAD);
    const receipt = await provider.commitPatch('test-project', 'mission/test', patch);
    expect(receipt).toBe(COMMIT);
    expect(createBlob).toHaveBeenCalledTimes(1);
    expect(createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: [HEAD] }));
    expect(updateRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'heads/mission/test',
      sha: COMMIT,
    }));
    expect(updateRef.mock.calls[0][0].force).not.toBe(true);
  });
});
