import { describe, expect, it, vi } from 'vitest';
import { GitHubProvider } from './GitHubProvider.js';

const SHA_A='a'.repeat(40);
const SHA_B='b'.repeat(40);
const baseData = {
  number: 832,
  state: 'open',
  draft: true,
  merged: false,
  user: { login: 'founder' },
  base: { ref:'main', sha:SHA_A },
  head: { ref:'fix/branch', sha:SHA_B, repo:{ full_name:'jussray/founder-control-room' } },
};

function setup(data: typeof baseData) {
  const provider = new GitHubProvider({
    token:'test-only-token',
    projectMap:{fcr:'jussray/founder-control-room'},
  });
  const get=vi.fn().mockResolvedValue({data});
  (provider as unknown as {octokit:{pulls:{get:typeof get}}}).octokit.pulls.get=get;
  return { provider,get };
}

describe('read-only pull request observations', () => {
  it('diagnoses drafts while the separate review gate still rejects them',async()=>{
    const {provider,get}=setup(baseData);
    const observation=await provider.observePullRequest('fcr',832);
    expect(observation).toMatchObject({
      number:832, state:'open',draft:true,
      baseSha:SHA_A,headSha:SHA_B,
    });
    await expect(provider.getPullRequestReviewContext('fcr',832)).rejects.toThrow(/not draft/);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith({owner:'jussray',repo:'founder-control-room',pull_number:832});
  });

  it('marks closed PRs as historical, never ready for review',async()=>{
    const {provider}=setup({...baseData,state:'closed',draft:false,merged:true});
    expect(await provider.observePullRequest('fcr',832)).toMatchObject({
      state:'closed',draft:false,merged:true,
    });
    await expect(provider.getPullRequestReviewContext('fcr',832)).rejects.toThrow(/must be open/);
  });

  it('rejects an invalid PR number before a provider request',async()=>{
    const {provider,get}=setup(baseData);
    await expect(provider.observePullRequest('fcr',0)).rejects.toThrow(/positive integer/);
    expect(get).not.toHaveBeenCalled();
  });
});
