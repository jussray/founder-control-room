import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import {
  BIP_CONTROL_ROOM_PROJECT,
  BIP_FCR_CHIEF_EVIDENCE_CONTRACT,
  createBipChiefEvidenceReceipt,
} from '../proofFederation/bipChiefBridge.js';
import {
  validateFederatedProofReceipt,
  type FederatedProofReceipt,
} from '../proofFederation/contract.js';
import { getGitHubInstallationToken } from '../providers/githubAppAuth.js';
import type { ControlRoomWorkerEnv } from './handler.js';

export const BIP_PROOF_INGRESS_PATH = '/ingest/bip-control-room-proof' as const;
export const BIP_PROOF_OIDC_AUDIENCE = 'https://api.foundercontrolroom.org/bip-control-room-proof' as const;
export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com' as const;
export const GITHUB_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks' as const;
export const CHIEF_FCR_RPC_CONTRACT = 'juss-v10/chief-fcr-rpc@v1' as const;

const BIP_OWNER = 'jussray';
const BIP_REPO = 'Sekret-Bip';
const BIP_BRANCH = 'main';
const BIP_REF = 'refs/heads/main';
const BIP_WORKFLOW_REF = 'jussray/Sekret-Bip/.github/workflows/control-room-test-ledger.yml@refs/heads/main';
const OBSERVER_CHECK_NAME = 'Publish exact-head test ledger';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAX_BODY_BYTES = 128_000;
const MAX_TOKEN_AGE_MS = 10 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'stale',
  'timed_out',
]);

interface GitHubOidcClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  jti?: unknown;
  repository?: unknown;
  ref?: unknown;
  sha?: unknown;
  event_name?: unknown;
  workflow_ref?: unknown;
}

interface CheckAggregate {
  state: 'passed' | 'warning' | 'failed' | 'pending' | 'unknown';
  counts: {
    total: number;
    passed: number;
    failed: number;
    queued: number;
    running: number;
    skipped: number;
    unknown: number;
  };
}

export interface BipProofIngressDependencies {
  verifyOidc?: (token: string, expectedSha: string, now: Date) => Promise<void>;
  observeGitHub?: (
    env: ControlRoomWorkerEnv,
    expectedSha: string,
  ) => Promise<CheckAggregate>;
  now?: () => Date;
}

function base64UrlJson(segment: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('github_oidc_malformed');
  }
}

function audienceIncludes(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  return Array.isArray(value) && value.some((item) => item === expected);
}

async function fetchJwk(kid: string): Promise<JsonWebKey> {
  const response = await fetch(GITHUB_OIDC_JWKS, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`github_oidc_jwks_unavailable:${response.status}`);
  const payload = await response.json() as { keys?: JsonWebKey[] };
  const key = payload.keys?.find((candidate) => candidate.kid === kid);
  if (!key) throw new Error('github_oidc_key_not_found');
  return key;
}

export async function verifyGitHubActionsOidc(
  token: string,
  expectedSha: string,
  now = new Date(),
  fetchJwkImpl: (kid: string) => Promise<JsonWebKey> = fetchJwk,
): Promise<void> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('github_oidc_malformed');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlJson(encodedHeader);
  const claims = base64UrlJson(encodedPayload) as GitHubOidcClaims;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('github_oidc_header_invalid');
  }

  const jwk = await fetchJwkImpl(header.kid);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    key,
    Buffer.from(encodedSignature, 'base64url'),
  );
  if (!verified) throw new Error('github_oidc_signature_invalid');

  const nowMs = now.getTime();
  const expMs = Number(claims.exp) * 1000;
  const iatMs = Number(claims.iat) * 1000;
  const nbfMs = Number(claims.nbf) * 1000;
  if (!Number.isFinite(expMs) || expMs < nowMs - MAX_CLOCK_SKEW_MS) throw new Error('github_oidc_expired');
  if (!Number.isFinite(iatMs) || iatMs > nowMs + MAX_CLOCK_SKEW_MS || nowMs - iatMs > MAX_TOKEN_AGE_MS) {
    throw new Error('github_oidc_iat_invalid');
  }
  if (Number.isFinite(nbfMs) && nbfMs > nowMs + MAX_CLOCK_SKEW_MS) throw new Error('github_oidc_not_yet_valid');
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error('github_oidc_issuer_invalid');
  if (!audienceIncludes(claims.aud, BIP_PROOF_OIDC_AUDIENCE)) throw new Error('github_oidc_audience_invalid');
  if (claims.repository !== BIP_CONTROL_ROOM_PROJECT) throw new Error('github_oidc_repository_invalid');
  if (claims.ref !== BIP_REF) throw new Error('github_oidc_ref_invalid');
  if (claims.sha !== expectedSha) throw new Error('github_oidc_sha_invalid');
  if (claims.event_name !== 'push') throw new Error('github_oidc_event_invalid');
  if (claims.workflow_ref !== BIP_WORKFLOW_REF) throw new Error('github_oidc_workflow_invalid');
  if (typeof claims.jti !== 'string' || !claims.jti) throw new Error('github_oidc_jti_missing');
}

function checkState(run: Record<string, any>): keyof CheckAggregate['counts'] {
  const status = String(run.status ?? '').trim();
  const conclusion = String(run.conclusion ?? '').trim();
  if (['queued', 'requested', 'waiting'].includes(status)) return 'queued';
  if (['in_progress', 'pending'].includes(status)) return 'running';
  if (status !== 'completed') return 'unknown';
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'neutral' || conclusion === 'skipped') return 'skipped';
  if (FAILURE_CONCLUSIONS.has(conclusion)) return 'failed';
  return 'unknown';
}

function latestCheckRuns(runs: Array<Record<string, any>>, sha: string): Array<Record<string, any>> {
  const selected = new Map<string, Record<string, any>>();
  for (const run of runs) {
    if (String(run.head_sha ?? '').toLowerCase() !== sha.toLowerCase()) continue;
    const name = String(run.name ?? '').trim();
    if (!name || name === OBSERVER_CHECK_NAME) continue;
    const app = String(run.app?.slug ?? run.app?.name ?? 'unknown-app').trim();
    const key = `${app}\u0000${name}`;
    const current = selected.get(key);
    const candidateTime = Date.parse(run.completed_at ?? run.started_at ?? '') || 0;
    const currentTime = current ? (Date.parse(current.completed_at ?? current.started_at ?? '') || 0) : -1;
    const candidateId = Number(run.id ?? -1);
    const currentId = Number(current?.id ?? -1);
    if (!current || candidateTime > currentTime || (candidateTime === currentTime && candidateId > currentId)) {
      selected.set(key, run);
    }
  }
  return [...selected.values()];
}

export function aggregateGitHubChecks(runs: Array<Record<string, any>>, sha: string): CheckAggregate {
  const checks = latestCheckRuns(runs, sha);
  const counts: CheckAggregate['counts'] = {
    total: checks.length,
    passed: 0,
    failed: 0,
    queued: 0,
    running: 0,
    skipped: 0,
    unknown: 0,
  };
  for (const run of checks) counts[checkState(run)] += 1;

  let state: CheckAggregate['state'] = 'passed';
  if (counts.total === 0) state = 'unknown';
  else if (counts.failed > 0) state = 'failed';
  else if (counts.queued > 0 || counts.running > 0) state = 'pending';
  else if (counts.skipped > 0 || counts.unknown > 0) state = 'warning';
  return { state, counts };
}

async function githubToken(env: ControlRoomWorkerEnv): Promise<string> {
  if (env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY) {
    return getGitHubInstallationToken(
      env.GITHUB_APP_ID,
      env.GITHUB_PRIVATE_KEY,
      BIP_CONTROL_ROOM_PROJECT,
    );
  }
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  throw new Error('github_auth_unavailable');
}

export async function observeBipGitHubAggregate(
  env: ControlRoomWorkerEnv,
  expectedSha: string,
): Promise<CheckAggregate> {
  const token = await githubToken(env);
  const octokit = new Octokit({ auth: token, userAgent: 'founder-control-room-bip-proof-ingress' });
  const branch = await octokit.repos.getBranch({ owner: BIP_OWNER, repo: BIP_REPO, branch: BIP_BRANCH });
  const currentSha = String(branch.data.commit.sha ?? '').toLowerCase();
  if (currentSha !== expectedSha.toLowerCase()) throw new Error('bip_proof_not_current_main');

  const runs = await octokit.paginate(octokit.checks.listForRef, {
    owner: BIP_OWNER,
    repo: BIP_REPO,
    ref: expectedSha,
    filter: 'all',
    per_page: 100,
  });
  return aggregateGitHubChecks(runs as Array<Record<string, any>>, expectedSha);
}

function expectedProofState(state: CheckAggregate['state']): FederatedProofReceipt['state'] {
  if (state === 'passed') return 'verified';
  if (state === 'warning') return 'inferred';
  if (state === 'failed') return 'failed';
  return 'unknown';
}

function receiptAggregate(receipt: FederatedProofReceipt): CheckAggregate['counts'] {
  const evidence = receipt.evidence.find((item) => item.type === 'github_check_aggregate');
  const match = evidence?.name.match(
    /^checks total=(\d+) passed=(\d+) failed=(\d+) queued=(\d+) running=(\d+) skipped=(\d+) unknown=(\d+)$/,
  );
  if (!match) throw new Error('bip_proof_aggregate_missing');
  const [total, passed, failed, queued, running, skipped, unknown] = match.slice(1).map(Number);
  return { total, passed, failed, queued, running, skipped, unknown };
}

export function verifyBipProofAgainstGitHub(
  receipt: FederatedProofReceipt,
  observed: CheckAggregate,
): void {
  if (receipt.project !== BIP_CONTROL_ROOM_PROJECT) throw new Error('bip_proof_project_invalid');
  if (receipt.actor !== 'sekret-bip-control-room') throw new Error('bip_proof_actor_invalid');
  if (receipt.exactTarget.repository !== BIP_CONTROL_ROOM_PROJECT) throw new Error('bip_proof_repository_invalid');
  if (receipt.exactTarget.branch !== BIP_BRANCH) throw new Error('bip_proof_branch_invalid');
  if (!receipt.exactTarget.sha || !FULL_SHA.test(receipt.exactTarget.sha)) throw new Error('bip_proof_sha_invalid');
  if (receipt.nextAuthority !== 'founder-control-room') throw new Error('bip_proof_authority_hop_invalid');
  if (receipt.operation !== 'exact_head_test_ledger') throw new Error('bip_proof_operation_invalid');

  const expectedState = expectedProofState(observed.state);
  if (receipt.state !== expectedState) throw new Error('bip_proof_state_drift');
  const submitted = receiptAggregate(receipt);
  for (const key of Object.keys(observed.counts) as Array<keyof CheckAggregate['counts']>) {
    if (submitted[key] !== observed.counts[key]) throw new Error(`bip_proof_count_drift:${key}`);
  }
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new Error('github_oidc_missing');
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new Error('github_oidc_missing');
  return token;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Founder-Control-Room-Service': 'founder-control-room',
    },
  });
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

export async function handleBipControlRoomProofIngress(
  request: Request,
  env: ControlRoomWorkerEnv,
  dependencies: BipProofIngressDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'body_too_large' });
  }

  try {
    const raw = await request.text();
    if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('body_size_invalid');
    const receipt = validateFederatedProofReceipt(JSON.parse(raw));
    const sha = receipt.exactTarget.sha;
    if (!sha || !FULL_SHA.test(sha)) throw new Error('bip_proof_sha_invalid');
    const now = dependencies.now?.() ?? new Date();

    const oidc = bearerToken(request);
    const verifyOidc = dependencies.verifyOidc ?? ((token, expectedSha, at) =>
      verifyGitHubActionsOidc(token, expectedSha, at));
    await verifyOidc(oidc, sha, now);

    const observeGitHub = dependencies.observeGitHub ?? observeBipGitHubAggregate;
    const observed = await observeGitHub(env, sha);
    verifyBipProofAgainstGitHub(receipt, observed);

    const chiefVersion = objectValue(await env.CHIEF_AI.version());
    if (
      chiefVersion?.ok !== true
      || chiefVersion.service !== 'chief-ai'
      || chiefVersion.rpcContract !== CHIEF_FCR_RPC_CONTRACT
      || chiefVersion.bipEvidenceContract !== BIP_FCR_CHIEF_EVIDENCE_CONTRACT
      || typeof chiefVersion.releaseSha !== 'string'
      || !FULL_SHA.test(chiefVersion.releaseSha)
    ) {
      throw new Error('chief_evidence_service_identity_invalid');
    }

    const chiefReceipt = createBipChiefEvidenceReceipt(receipt, now);
    const chiefResponse = objectValue(await env.CHIEF_AI.ingestBipEvidence(chiefReceipt));
    if (
      chiefResponse?.ok !== true
      || chiefResponse.status !== 200
      || chiefResponse.service !== 'chief-ai'
      || chiefResponse.rpcContract !== CHIEF_FCR_RPC_CONTRACT
      || chiefResponse.bipEvidenceContract !== BIP_FCR_CHIEF_EVIDENCE_CONTRACT
      || chiefResponse.releaseSha !== chiefVersion.releaseSha
      || objectValue(chiefResponse.result)?.accepted !== true
    ) {
      throw new Error('chief_evidence_ingestion_rejected');
    }

    return json(202, {
      accepted: true,
      project: 'sekret-bip',
      sourceReceiptId: receipt.receiptId,
      sourceRevision: sha,
      chiefReleaseSha: chiefVersion.releaseSha,
      contract: BIP_FCR_CHIEF_EVIDENCE_CONTRACT,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const authenticationFailure = detail.startsWith('github_oidc_');
    const drift = detail.startsWith('bip_proof_');
    return json(authenticationFailure ? 401 : drift ? 409 : 422, {
      error: authenticationFailure
        ? 'github_oidc_rejected'
        : drift
          ? 'bip_proof_rejected'
          : 'bip_evidence_relay_failed',
      detail,
    });
  }
}
