import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../src/founder-os-lab/projectAdapters.ts';
import { assessProjectAdapterFreshness } from '../src/founder-os-lab/projectAdapterFreshness.ts';

const RECEIPT_PATH = process.env.SEKRET_BIP_ADAPTER_FRESHNESS_RECEIPT
  ?? 'test-results/sekret-bip-adapter-freshness.json';
const API_ROOT = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const TOKEN = process.env.GITHUB_TOKEN?.trim() || '';
const adapter = FOUNDER_OS_LAB_PROJECT_ADAPTERS.find((candidate) => candidate.id === 'sekret-bip');

if (!adapter) {
  throw new Error('sekret-bip project adapter is not registered');
}

function apiHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'founder-control-room-sekret-bip-adapter-freshness',
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

async function writeReceipt(receipt: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const [owner, repo] = adapter.repository.split('/');
  if (!owner || !repo) throw new Error('sekret-bip adapter repository is malformed');

  const checkedAt = new Date().toISOString();
  try {
    const currentHead = await readMainHead(owner, repo);
    const observedContractBlobs: Record<string, string> = {};

    for (const path of adapter.requiredContractPaths) {
      const payload = await githubJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedRepoPath(path)}?ref=${encodeURIComponent(currentHead)}`,
      );
      if (!isRecord(payload) || payload.type !== 'file' || typeof payload.sha !== 'string') {
        throw new Error(`github_contract_blob_payload_invalid:${path}`);
      }
      observedContractBlobs[path] = payload.sha.toLowerCase();
    }

    const confirmedHead = await readMainHead(owner, repo);
    if (confirmedHead !== currentHead) {
      throw new Error(`github_main_moved_during_verification:${currentHead}:${confirmedHead}`);
    }

    const assessment = assessProjectAdapterFreshness({
      repository: adapter.repository,
      auditedHead: adapter.auditedSourceHead,
      currentHead,
      auditedContractBlobs: adapter.auditedContractBlobs,
      observedContractBlobs,
    });
    const receipt = {
      schemaVersion: 1,
      kind: 'sekret-bip-adapter-freshness',
      checkedAt,
      source: 'github-api-read',
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
    await writeReceipt(receipt);
    console.log(JSON.stringify(receipt, null, 2));

    if (assessment.state !== 'verified' || assessment.freshness !== 'fresh') {
      process.exitCode = 1;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const receipt = {
      schemaVersion: 1,
      kind: 'sekret-bip-adapter-freshness',
      checkedAt,
      source: 'github-api-read',
      adapterId: adapter.id,
      repository: adapter.repository,
      auditedHead: adapter.auditedSourceHead,
      currentHead: null,
      mainHeadConfirmedAfterBlobRead: false,
      assessment: {
        state: 'unknown',
        freshness: 'missing',
        recommendation: 'hold',
        blocker: 'Authoritative Se’kret Bip source truth could not be proven stable.',
        nextAction: 'Restore read authority or wait for repository head stability, then rerun the freshness verifier.',
        reasons: [detail],
        founderReviewRequired: true,
        promotionAllowed: false,
        mutationAuthorized: false,
      },
      mutationAuthorized: false,
      providerMutationPerformed: false,
    };
    await writeReceipt(receipt);
    console.error(JSON.stringify(receipt, null, 2));
    process.exitCode = 1;
  }
}

await main();
