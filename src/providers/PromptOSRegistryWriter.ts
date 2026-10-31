import { Octokit } from '@octokit/rest';
import { getGitHubInstallationToken } from './githubAppAuth.js';

export const PROMPTOS_REGISTRY_REPOSITORY = 'jussray/promptos' as const;
export const PROMPTOS_REGISTRY_BRANCH = 'main' as const;
export const PROMPTOS_REGISTRY_PATH = 'workflows/registry.json' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface PromptOSRegistryCommitReceipt {
  repository: typeof PROMPTOS_REGISTRY_REPOSITORY;
  branch: typeof PROMPTOS_REGISTRY_BRANCH;
  path: typeof PROMPTOS_REGISTRY_PATH;
  expectedHeadSha: string;
  commitSha: string;
  providerDisposition: 'COMMITTED' | 'RECONCILED_AFTER_AMBIGUOUS_RESPONSE';
}

interface PromptOSGitHubClient {
  repos: {
    getBranch(input: { owner: string; repo: string; branch: string }): Promise<{ data: { commit: { sha: string; commit: { tree: { sha: string } } } } }>;
  };
  git: {
    createBlob(input: { owner: string; repo: string; content: string; encoding: 'utf-8' }): Promise<{ data: { sha: string } }>;
    createTree(input: {
      owner: string;
      repo: string;
      base_tree: string;
      tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }>;
    }): Promise<{ data: { sha: string } }>;
    createCommit(input: {
      owner: string;
      repo: string;
      message: string;
      tree: string;
      parents: string[];
      author?: { name: string; email: string };
    }): Promise<{ data: { sha: string } }>;
    updateRef(input: {
      owner: string;
      repo: string;
      ref: string;
      sha: string;
      force: false;
    }): Promise<unknown>;
  };
}

export class PromptOSRegistryWriter {
  private readonly client: PromptOSGitHubClient;

  constructor(client: PromptOSGitHubClient) {
    this.client = client;
  }

  async commitRegistryAtExpectedHead(input: {
    expectedHeadSha: string;
    registryContent: string;
    message: string;
    authorName: string;
    authorEmail?: string;
  }): Promise<PromptOSRegistryCommitReceipt> {
    const expectedHeadSha = input.expectedHeadSha.trim().toLowerCase();
    if (!FULL_SHA.test(expectedHeadSha)) {
      throw new Error('PROMPTOS_REGISTRY_WRITE_EXPECTED_HEAD_INVALID');
    }
    if (!input.registryContent.endsWith('\n')) {
      throw new Error('PROMPTOS_REGISTRY_WRITE_CONTENT_NONCANONICAL: registry content must end with a newline');
    }
    if (!input.message.trim()) throw new Error('PROMPTOS_REGISTRY_WRITE_MESSAGE_REQUIRED');
    if (!input.authorName.trim()) throw new Error('PROMPTOS_REGISTRY_WRITE_AUTHOR_REQUIRED');

    const owner = 'jussray';
    const repo = 'promptos';
    const branch = PROMPTOS_REGISTRY_BRANCH;

    const observed = await this.client.repos.getBranch({ owner, repo, branch });
    const observedHead = observed.data.commit.sha.toLowerCase();
    if (observedHead !== expectedHeadSha) {
      throw new Error(
        `PROMPTOS_REGISTRY_WRITE_TARGET_MOVED: expected ${expectedHeadSha}, observed ${observedHead}`,
      );
    }

    const blob = await this.client.git.createBlob({
      owner,
      repo,
      content: input.registryContent,
      encoding: 'utf-8',
    });
    const tree = await this.client.git.createTree({
      owner,
      repo,
      base_tree: observed.data.commit.commit.tree.sha,
      tree: [{
        path: PROMPTOS_REGISTRY_PATH,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha,
      }],
    });
    const commit = await this.client.git.createCommit({
      owner,
      repo,
      message: input.message.trim(),
      tree: tree.data.sha,
      parents: [expectedHeadSha],
      ...(input.authorEmail
        ? { author: { name: input.authorName.trim(), email: input.authorEmail.trim() } }
        : {}),
    });
    const commitSha = commit.data.sha.toLowerCase();
    if (!FULL_SHA.test(commitSha)) {
      throw new Error('PROMPTOS_REGISTRY_WRITE_PROVIDER_COMMIT_INVALID');
    }

    let providerDisposition: PromptOSRegistryCommitReceipt['providerDisposition'] = 'COMMITTED';
    try {
      await this.client.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commitSha,
        force: false,
      });
    } catch (error) {
      const reconciled = await this.client.repos.getBranch({ owner, repo, branch });
      const reconciledHead = reconciled.data.commit.sha.toLowerCase();
      if (reconciledHead !== commitSha) {
        throw new Error(
          `PROMPTOS_REGISTRY_WRITE_NOT_APPLIED: provider rejected or raced the exact-head update; current=${reconciledHead}; cause=${error instanceof Error ? error.message : String(error)}`,
        );
      }
      providerDisposition = 'RECONCILED_AFTER_AMBIGUOUS_RESPONSE';
    }

    const readback = await this.client.repos.getBranch({ owner, repo, branch });
    const readbackHead = readback.data.commit.sha.toLowerCase();
    if (readbackHead !== commitSha) {
      throw new Error(
        `PROMPTOS_REGISTRY_WRITE_READBACK_MISMATCH: expected ${commitSha}, observed ${readbackHead}`,
      );
    }

    return {
      repository: PROMPTOS_REGISTRY_REPOSITORY,
      branch: PROMPTOS_REGISTRY_BRANCH,
      path: PROMPTOS_REGISTRY_PATH,
      expectedHeadSha,
      commitSha,
      providerDisposition,
    };
  }
}

export async function createAppAwarePromptOSRegistryWriter(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PromptOSRegistryWriter> {
  const fallbackToken = env.GITHUB_TOKEN?.trim();
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
  if (Boolean(appId) !== Boolean(privateKey)) {
    throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together');
  }
  if (!fallbackToken && !(appId && privateKey)) {
    throw new Error(
      'GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or a local GITHUB_TOKEN fallback',
    );
  }
  const token = appId && privateKey
    ? await getGitHubInstallationToken(appId, privateKey, PROMPTOS_REGISTRY_REPOSITORY)
    : fallbackToken!;
  return new PromptOSRegistryWriter(new Octokit({
    auth: token,
    ...(env.GITHUB_API_BASE_URL ? { baseUrl: env.GITHUB_API_BASE_URL } : {}),
  }) as unknown as PromptOSGitHubClient);
}
