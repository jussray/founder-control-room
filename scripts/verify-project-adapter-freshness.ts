import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../src/founder-os-lab/projectAdapters.ts';
import { assessProjectAdapterFreshness } from '../src/founder-os-lab/projectAdapterFreshness.ts';

const RECEIPT_PATH = process.env.PROJECT_ADAPTER_FRESHNESS_RECEIPT
  ?? 'test-results/project-adapter-freshness.json';
const API_ROOT = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const TOKEN = process.env.GITHUB_TOKEN?.trim() || '';

function apiHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'founder-control-room-project-adapter-freshness',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

async function githubJson(path: string): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, { headers: apiHeaders() });
  if (!response.ok) {
    throw new Error(`github_read_failed:${response.status}:${response.statusText}`);
  }
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function encodedRepoPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function readMainHead(owner: string, repo: string): Promise<string> {
  const payload = await githubJson(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/main`,
  );
  if (!isRecord(payload) || typeof payload.sha !== 'string') {
    throw new Error('github_current_head_payload_invalid');
  }
  return payload.sha.toLowerCase();
}

async function verifyAdapter(adapter: (typeof FOUNDER_OS_LAB_PROJECT_ADAPTERS)[number]) {
  const [owner, repo] = adapter.repository.split('/');
  if (!owner || !repo) throw new Error(`project_adapter_repository_malformed:${adapter.id}`);

  const currentHead = await readMainHead(owner, repo);
  const observedContractBlobs: Record<string, string> = {};

  for (const path of adapter.requiredContractPaths) {
    const payload = await githubJson(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedRepoPath(path)}?ref=${encodeURIComponent(currentHead)}`,
    );
    if (!isRecord(payload) || payload.type !== 'file' || typeof payload.sha !== 'string') {
      throw new Error(`github_contract_blob_payload_invalid:${adapter.id}:${path}`);
    }
    observedContractBlobs[path] = payload.sha.toLowerCase();
  }

  const confirmedHead = await readMainHead(owner, repo);
  if (confirmedHead !== currentHead) {
    throw new Error(`github_main_moved_during_verification:${adapter.id}:${currentHead}:${confirmedHead}`);
  }

  const assessment = assessProjectAdapterFreshness({
    repository: adapter.repository,
    auditedHead: adapter.auditedSourceHead,
    currentHead,
    auditedContractBlobs: adapter.auditedContractBlobs,
    observedContractBlobs,
  });

  return {
    adapterId: adapter.id,
    repository: adapter.repository,
    auditedHead: adapter.auditedSourceHead,
    currentHead,
    mainHeadConfirmedAfterBlobRead: true,
    auditedContractBlobs: adapter.auditedContractBlobs,
    observedContractBlobs,
    assessment,
    mutationAuthorized: false,
    providerMutationPerformed: false,
  };
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const results: Record<string, unknown>[] = [];
  let failed = false;

  for (const adapter of FOUNDER_OS_LAB_PROJECT_ADAPTERS) {
    try {
      const result = await verifyAdapter(adapter);
      results.push(result);
      const assessment = result.assessment;
      if (assessment.state !== 'verified' || assessment.freshness !== 'fresh') failed = true;
    } catch (error) {
      failed = true;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        adapterId: adapter.id,
        repository: adapter.repository,
        auditedHead: adapter.auditedSourceHead,
        currentHead: null,
        mainHeadConfirmedAfterBlobRead: false,
        assessment: {
          state: 'unknown',
          freshness: 'missing',
          recommendation: 'hold',
          blocker: `Authoritative source truth could not be proven stable for ${adapter.id}.`,
          nextAction: 'Restore read authority or wait for repository head stability, then rerun the freshness verifier.',
          reasons: [detail],
          founderReviewRequired: true,
          promotionAllowed: false,
          mutationAuthorized: false,
        },
        mutationAuthorized: false,
        providerMutationPerformed: false,
      });
    }
  }

  const receipt = {
    schemaVersion: 1,
    kind: 'portfolio-project-adapter-freshness',
    checkedAt,
    source: 'github-api-read',
    adapterCount: FOUNDER_OS_LAB_PROJECT_ADAPTERS.length,
    allFresh: !failed,
    results,
    mutationAuthorized: false,
    providerMutationPerformed: false,
  };

  await mkdir(dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (failed) process.exitCode = 1;
}

await main();
