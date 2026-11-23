/**
 * Isolated Playwright proof for founder-bound checkpoint save -> list -> read.
 * Uses the real FCR Express server, Supabase JS HTTP clients, and an ephemeral
 * synthetic Auth/PostgREST fixture. NEVER contacts production Supabase.
 * This is NOT proof of a real founder login or a Cloudflare deployment.
 *
 * Run: node --import tsx e2e/operator-continuation-founder-preview.mjs
 */
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const PROJECT = '00000000-0000-4000-8000-000000000101';
const FOUNDER = '00000000-0000-4000-8000-000000000201';
const ROW = '00000000-0000-4000-8000-000000000301';
const AUTH = 'synthetic-preview-founder-token';
const NONFOUNDER_AUTH = 'synthetic-preview-nonfounder-token';
const EMAIL = 'preview-founder@example.invalid';
const rows = [];
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const fakeSupabase = httpServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://localhost');
  const path = u.pathname;
  if (path === '/auth/v1/user') {
    if (req.headers.authorization !== 'Bearer ' + AUTH
      && req.headers.authorization !== 'Bearer ' + NONFOUNDER_AUTH) return json(res, 401, { message: 'invalid_token' });
    const isFounder = req.headers.authorization === 'Bearer ' + AUTH;
    return json(res, 200, {
      id: isFounder ? FOUNDER : '00000000-0000-4000-8000-000000000202',
      email: isFounder ? EMAIL : 'nonfounder@example.invalid',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      aud: 'authenticated', role: 'authenticated',
    });
  }
  if (path === '/rest/v1/founder_users' && req.method === 'GET') {
    const permitted = u.searchParams.get('email') === 'eq.' + EMAIL
      && u.searchParams.get('user_id') === 'eq.' + FOUNDER;
    return json(res, 200, permitted ? { user_id: FOUNDER } : null);
  }
  if (path === '/rest/v1/projects' && req.method === 'GET') {
    const valid = u.searchParams.get('slug') === 'eq.founder-control-room';
    return json(res, 200, valid ? { id: PROJECT, repo_identifier: 'jussray/founder-control-room' } : null);
  }
  if (path === '/rest/v1/continuity_records' && req.method === 'GET') {
    let filtered = rows.filter(x => u.searchParams.get('project_id') === 'eq.' + x.project_id);
    if (u.searchParams.has('task_id') && u.searchParams.get('task_id') !== 'not.is.null') {
      filtered = filtered.filter(x => u.searchParams.get('task_id') === 'eq.' + x.task_id);
    }
    filtered.sort((a, b) => Date.parse(b.checkpoint_observed_at)
      - Date.parse(a.checkpoint_observed_at) || Date.parse(b.created_at) - Date.parse(a.created_at));
    filtered = filtered.slice(0, Number(u.searchParams.get('limit') ?? 200));
    const single = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json');
    return json(res, 200, single ? filtered[0] ?? null : filtered);
  }
  if (path === '/rest/v1/continuity_records' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    if (input.project_id !== PROJECT || !input.task_id) return json(res, 400, { code: 'invalid_row' });
    if (rows.some(x => x.project_id === input.project_id && x.task_id === input.task_id
      && x.checkpoint_observed_at === input.checkpoint_observed_at)) {
      return json(res, 409, { code: '23505' });
    }
    const row = { ...input, id: ROW, created_at: new Date().toISOString(), invalidated_at: null };
    rows.push(row);
    return json(res, 201, row);
  }
  return json(res, 404, { code: 'unexpected_fixture_route' });
});
await new Promise(resolve => fakeSupabase.listen(0, '127.0.0.1', resolve));
const fakePort = fakeSupabase.address().port;

process.env.NODE_ENV = 'test';
process.env.SUPABASE_ALLOW_LOCAL = 'true';
process.env.SUPABASE_URL = 'http://127.0.0.1:' + fakePort;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-local-test-service-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-local-test-publishable-key';
process.env.FOUNDER_API_URL = 'http://localhost:8787';
process.env.FOUNDER_ALLOWED_ORIGINS = 'http://localhost:8787';

const { createServer } = await import('../src/http/server.ts');
const {
  createOperatorContinuityReceiptV2,
  createOperatorExecutionContinuation,
} = await import('../src/lib/operatorContinuity.ts');

const now = Date.now();
const observedAt = new Date(now - 30_000).toISOString();
const observationInput = {
  source: 'chatgpt', projectSlug: 'founder-control-room',
  repositoryFullName: 'jussray/founder-control-room',
  targetBranch: 'fix/fcr-shared-task-mcp-read-20261121', targetSha: sha,
  prNumber: null, baseSha: null, headSha: null,
  scopeFingerprint: null, proofFingerprint: null,
  reviewFingerprint: null, providerFingerprint: null,
  runtimeFingerprint: null, authorityFingerprint: null,
  evidenceRefs: ['github:commit/' + sha],
  observedAt, expiresAt: new Date(now + 60 * 60_000).toISOString(),
  predecessorFingerprint: null,
};
function packet(observation) {
  return createOperatorExecutionContinuation({
    sourceMode: 'chat', taskId: 'fcr-preview-checkpoint',
    intentRef: 'fcr:intents/fcr-preview-checkpoint',
    contextRefs: ['fcr:artifacts/preview'],
    completedSteps: [{ stepId: 'observe', evidenceRefs: ['github:commit/' + sha] }],
    remainingStepIds: ['revalidate-live-founder'],
    nextActionRef: 'fcr:actions/revalidate-founder',
    pendingDecisionRefs: [],
    observation: createOperatorContinuityReceiptV2(observation),
  });
}
const current = packet(observationInput);
const app = createServer();
const service = await new Promise(resolve => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const base = 'http://127.0.0.1:' + service.address().port;
const scope = '?projectSlug=founder-control-room&repositoryFullName=jussray%2Ffounder-control-room';

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const denied = await page.goto(base + '/operator/continuity' + scope);
  assert.equal(denied.status(), 401, 'anonymous discovery must be denied');

  const authorizedHeaders = {
    Authorization: 'Bearer ' + AUTH,
    Origin: 'http://localhost:8787',
    'Sec-Fetch-Site': 'same-origin',
  };
  const request = await browser.newContext({ extraHTTPHeaders: authorizedHeaders });
  const api = request.request;
  const initiallyEmpty = await api.get(base + '/operator/continuity' + scope);
  assert.equal(initiallyEmpty.status(), 200, 'founder should list empty checkpoint ledger');
  assert.deepEqual((await initiallyEmpty.json()).items, []);

  const saved = await api.post(base + '/operator/continuity', { data: { continuation: current } });
  assert.equal(saved.status(), 201, 'founder saves one checkpoint');
  assert.equal((await saved.json()).executionAuthorityFromHandoff, false);

  const found = await api.get(base + '/operator/continuity' + scope);
  assert.equal(found.status(), 200);
  const list = await found.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].taskId, current.taskId);
  assert.deepEqual(list.items[0].remainingStepIds, ['revalidate-live-founder']);
  assert.equal(list.currentEvidenceVerified, false);
  assert.equal(list.authorizesExecution, false);
  assert.equal(JSON.stringify(list).includes('fcr:artifacts/preview'), false, 'context refs stay outside discovery');

  const retrieved = await api.get(base + '/operator/continuity/' + current.taskId + scope);
  assert.equal(retrieved.status(), 200);
  const full = await retrieved.json();
  assert.equal(full.continuation.record.fingerprint, current.fingerprint);
  assert.equal(full.executionAuthorityFromHandoff, false);
  assert.equal(full.currentEvidenceVerified, false);

  const duplicate = await api.post(base + '/operator/continuity', { data: { continuation: current } });
  assert.equal(duplicate.status(), 200);
  assert.equal((await duplicate.json()).disposition, 'duplicate');
  assert.equal(rows.length, 1);

  const older = packet({ ...observationInput, observedAt: new Date(now - 60_000).toISOString() });
  const stale = await api.post(base + '/operator/continuity', { data: { continuation: older } });
  assert.equal(stale.status(), 409);
  assert.equal(rows.length, 1);

  const wrongRepo = await api.get(base + '/operator/continuity?projectSlug=founder-control-room&repositoryFullName=someone%2Felse');
  assert.equal(wrongRepo.status(), 404);

  const invalidBearer = await browser.newContext({ extraHTTPHeaders: {
    Authorization: 'Bearer synthetic-invalid-token',
  } });
  const deniedInvalid = await invalidBearer.request.get(base + '/operator/continuity' + scope);
  assert.equal(deniedInvalid.status(), 401);
  await invalidBearer.close();
  const nonfounder = await browser.newContext({ extraHTTPHeaders: {
    Authorization: 'Bearer ' + NONFOUNDER_AUTH,
  } });
  const deniedNonfounder = await nonfounder.request.get(base + '/operator/continuity' + scope);
  assert.equal(deniedNonfounder.status(), 403, 'verified non-founder must be denied');
  await nonfounder.close();
  await request.close();

  console.log(JSON.stringify({
    contract: 'fcr/isolated-founder-continuation-playwright@v1',
    exactHead: sha, syntheticFixture: true, realFounderAccountVerified: false,
    productionSupabaseAccess: false, cloudflarePreviewDeployed: false,
    realFcrExpressServer: true, realSupabaseJsHttpClient: true,
    browser: 'chromium', anonymousDenied: 401,
    founderSave: 201, founderList: 200, founderRead: 200,
    duplicate: 200, stale: 409, crossRepositoryDenied: 404,
    invalidTokenDenied: 401, nonfounderDenied: 403, executionAuthorityFromHandoff: false,
    storedSyntheticRows: rows.length, status: 'PASS',
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => service.close(resolve));
  await new Promise(resolve => fakeSupabase.close(resolve));
}
