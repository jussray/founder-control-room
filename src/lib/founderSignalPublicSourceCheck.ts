/**
 * Independent, bounded public GitHub repository/commit existence check.
 * READ ONLY: fixed API host, GET only, no credentials and no provider mutations.
 * This is not deployment, media, customer, PR-merge or product-claim proof.
 */
export const FSE_PUBLIC_SOURCE_TOOL = 'verify_founder_signal_public_source' as const;
export const FSE_PUBLIC_SOURCE_CONTRACT = 'fcr/founder-signal-public-source-check@v1' as const;
const SHA = /^[a-f0-9]{40}$/i;
const REPO = /^jussray\/(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9_.-]{0,78}[A-Za-z0-9])$/i;
const HOST = 'https://api.github.com';
type JsonRecord = Record<string, unknown>;
const record = (x: unknown): JsonRecord | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? x as JsonRecord : null;
const trim = (x: unknown): string => typeof x === 'string' ? x.trim() : '';

export interface PublicSourceCheckDependencies {
  fetchFn?: typeof fetch;
  now?: () => Date;
}

function hold(repository: string, sha: string, reason: string, observedAt: string) {
  return {
    contract: FSE_PUBLIC_SOURCE_CONTRACT,
    status: 'HOLD_UNVERIFIED' as const,
    evidenceClass: 'NOT_VERIFIED' as const,
    repository,
    commitSha: sha,
    observedAt,
    reason,
    repoPublicVerified: false,
    commitExistsVerified: false,
    sourceClaimVerified: false,
    deploymentVerified: false,
    proofOfBusinessOutcome: false,
    authorizesDraft: false,
    authorizesPublish: false,
    providerWriteOccurred: false,
  };
}

export async function verifyFounderSignalPublicSource(raw: unknown, deps: PublicSourceCheckDependencies = {}) {
  const observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const input = record(raw);
  const repository = trim(input?.repository);
  const sha = trim(input?.commitSha).toLowerCase();
  if (!input || Object.keys(input).some(k => !['repository', 'commitSha', 'proofUrl'].includes(k))) {
    return hold(repository, sha, 'INVALID_SOURCE_INPUT', observedAt);
  }
  if (!REPO.test(repository) || !SHA.test(sha)) {
    return hold(repository, sha, 'INVALID_OWNED_REPOSITORY_OR_SHA', observedAt);
  }
  const proofUrl = trim(input.proofUrl);
  const expectedProof = 'https://github.com/' + repository + '/commit/' + sha;
  if (proofUrl !== expectedProof) {
    return hold(repository, sha, 'PROOF_LINK_MUST_MATCH_EXACT_COMMIT', observedAt);
  }
  const fetchFn = deps.fetchFn ?? fetch;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Founder-Signal-Engine-ReadOnly-Gate' };
  const get = async (path: string): Promise<JsonRecord | null> => {
    try {
      const response = await fetchFn(HOST + path, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!/^application\/json\b/.test(contentType)) return null;
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > 65_536) return null;
      const rawBody = await response.text();
      if (Buffer.byteLength(rawBody, 'utf8') > 65_536) return null;
      return record(JSON.parse(rawBody));
    } catch {
      return null;
    }
  };
  const repo = await get('/repos/' + repository);
  if (!repo || repo.private !== false || typeof repo.full_name !== 'string' ||
    repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    return hold(repository, sha, 'PUBLIC_REPOSITORY_READBACK_NOT_VERIFIED', observedAt);
  }
  const commit = await get('/repos/' + repository + '/commits/' + sha);
  if (!commit || trim(commit.sha).toLowerCase() !== sha ||
    trim(commit.html_url).toLowerCase() !== expectedProof.toLowerCase()) {
    return hold(repository, sha, 'EXACT_COMMIT_READBACK_NOT_VERIFIED', observedAt);
  }

  return {
    contract: FSE_PUBLIC_SOURCE_CONTRACT,
    status: 'VERIFIED_PUBLIC_GITHUB_COMMIT' as const,
    evidenceClass: 'LIVE_PUBLIC_GITHUB_READBACK' as const,
    reason: null,
    repository,
    commitSha: sha,
    proofUrl: expectedProof,
    observedAt,
    repoPublicVerified: true,
    commitExistsVerified: true,
    sourceClaimVerified: false,
    deploymentVerified: false,
    proofOfBusinessOutcome: false,
    authorizesDraft: false,
    authorizesPublish: false,
    providerWriteOccurred: false,
    warning: 'This verifies public repository visibility and exact commit existence only. It does NOT prove the post claims, CI, deployment, media, current head, approval, usage, partners or results.',
  };
}
