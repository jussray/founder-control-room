import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { apply, rollback } from './run-fcr-access-public-worker-split.mjs';
import { runFcrAccessSplitCli } from './fcr-access-public-worker-split-cli.mjs';
import { FCR_CLOUDFLARE_ACCOUNT_ID, FCR_PUBLIC_ZONE } from './reconcile-cloudflare-access-public-zone.mjs';

// Regression coverage for the confirmed Access split defects:
// - post-create failures must persist the exact run-owned split receipt so rollback can recover;
// - rollback must refuse a receipt from a different expected head before any provider call;
// - the Access split scripts stay manual-only (no workflow executes them).
// All provider traffic goes through an in-memory fake. No live Cloudflare call is made.

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const SPLIT_RECEIPT = 'test-results/fcr-access-public-worker-split.json';
const PUBLIC_RECEIPT = 'test-results/fcr-access-front-door-recovery.json';

function envFor(expectedHeadSha, runId) {
  return {
    CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: 'cf-admin-token-456',
    CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
    EXPECTED_HEAD_SHA: expectedHeadSha,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: '1',
  };
}

function success(result, status = 200) {
  return { ok: true, status, async json() { return { success: true, result }; } };
}

function allowPolicy() {
  return {
    id: 'allow-1',
    decision: 'allow',
    include: [{ email: { email: 'founder@example.test' } }],
    require: [],
    exclude: [],
    precedence: 1,
  };
}

function mixedApp() {
  return {
    id: 'mixed-1',
    name: 'existing FCR mixed Access app',
    type: 'self_hosted',
    domain: FCR_PUBLIC_ZONE,
    session_duration: '24h',
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
      { type: 'worker', worker_id: 'founder-control-room' },
    ],
  };
}

function fakeProvider({ dropPublicBypassAfterCreate = false } = {}) {
  const state = {
    applications: [mixedApp()],
    policiesByApp: { 'mixed-1': [allowPolicy()] },
    requests: [],
  };
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, url });

    if (url.includes('/access/apps?') && method === 'GET') {
      return success(structuredClone(state.applications));
    }
    const policyMatch = url.match(/\/access\/apps\/([^/]+)\/policies\?/);
    if (policyMatch && method === 'GET') {
      return success(structuredClone(state.policiesByApp[decodeURIComponent(policyMatch[1])] ?? []));
    }
    const appMatch = url.match(/\/access\/apps\/([^/]+)$/);
    if (appMatch && method === 'GET') {
      const id = decodeURIComponent(appMatch[1]);
      return success(structuredClone(state.applications.find((app) => app.id === id) ?? null));
    }
    if (appMatch && method === 'PUT') {
      const id = decodeURIComponent(appMatch[1]);
      const index = state.applications.findIndex((app) => app.id === id);
      state.applications[index] = { ...state.applications[index], destinations: structuredClone(body.destinations) };
      return success(structuredClone(state.applications[index]));
    }
    if (url.endsWith('/access/apps') && method === 'POST') {
      const created = { id: 'public-1', ...body };
      state.applications.push(structuredClone(created));
      state.policiesByApp['public-1'] = dropPublicBypassAfterCreate ? [] : structuredClone(body.policies ?? []);
      return success(structuredClone(created), 201);
    }
    if (appMatch && method === 'DELETE') {
      const id = decodeURIComponent(appMatch[1]);
      state.applications = state.applications.filter((app) => app.id !== id);
      delete state.policiesByApp[id];
      return success({ id });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return { state, fetchImpl };
}

async function inTempDirectory(run) {
  const original = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), 'fcr-access-split-recovery-'));
  process.chdir(dir);
  try {
    mkdirSync('test-results', { recursive: true });
    return await run();
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
}

test('post-create failure persists an exact run-owned split receipt that rollback recovers', async () => {
  await inTempDirectory(async () => {
    const provider = fakeProvider({ dropPublicBypassAfterCreate: true });
    await assert.rejects(
      apply(envFor(HEAD_A, '101'), { fetchImpl: provider.fetchImpl }),
      (error) => error?.classification === 'split-public-bypass-missing'
        && error?.mutationOutcome === 'performed',
    );

    const split = JSON.parse(readFileSync(SPLIT_RECEIPT, 'utf8'));
    assert.equal(split.splitApplied, true);
    assert.equal(split.mutationOutcome, 'performed');
    assert.equal(split.managedApplicationId, 'public-1');
    assert.equal(split.sourceApplicationId, 'mixed-1');
    assert.equal(split.originalDestinations.length, 2);
    assert.equal(split.expectedHeadSha, HEAD_A);
    assert.equal(split.workflowRunId, '101');

    const blocked = JSON.parse(readFileSync(PUBLIC_RECEIPT, 'utf8'));
    assert.equal(blocked.state, 'blocked');
    assert.equal(blocked.mutationPerformed, true);

    await rollback(envFor(HEAD_A, '102'), { fetchImpl: provider.fetchImpl });

    assert.equal(provider.state.applications.some((app) => app.id === 'public-1'), false);
    assert.deepEqual(
      provider.state.applications.find((app) => app.id === 'mixed-1').destinations,
      mixedApp().destinations,
    );
    const rolledBack = JSON.parse(readFileSync(SPLIT_RECEIPT, 'utf8'));
    assert.equal(rolledBack.rollbackPerformed, true);
    assert.equal(rolledBack.splitApplied, false);
    assert.equal(rolledBack.expectedHeadSha, HEAD_A);
    assert.equal(rolledBack.workflowRunId, '101');
    assert.equal(rolledBack.rollbackWorkflowRunId, '102');
    assert.equal(rolledBack.rollbackExpectedHeadSha, HEAD_A);
    const publicAfter = JSON.parse(readFileSync(PUBLIC_RECEIPT, 'utf8'));
    assert.equal(publicAfter.state, 'attention');
    assert.equal(publicAfter.rollbackPerformed, true);
  });
});

test('rollback refuses a split receipt from a different expected head before any provider call', async () => {
  await inTempDirectory(async () => {
    const provider = fakeProvider();
    await apply(envFor(HEAD_A, '201'), { fetchImpl: provider.fetchImpl });
    const requestsBefore = provider.state.requests.length;
    const splitBefore = readFileSync(SPLIT_RECEIPT, 'utf8');
    const publicBefore = readFileSync(PUBLIC_RECEIPT, 'utf8');

    await assert.rejects(
      rollback(envFor(HEAD_B, '202'), { fetchImpl: provider.fetchImpl }),
      (error) => error?.classification === 'split-rollback-head-mismatch'
        && error?.mutationOutcome === 'none',
    );

    assert.equal(provider.state.requests.length, requestsBefore);
    assert.equal(provider.state.applications.some((app) => app.id === 'public-1'), true);
    assert.equal(readFileSync(SPLIT_RECEIPT, 'utf8'), splitBefore);
    assert.equal(readFileSync(PUBLIC_RECEIPT, 'utf8'), publicBefore);
  });
});

test('rollback refuses a split receipt that names no expected head', async () => {
  await inTempDirectory(async () => {
    const provider = fakeProvider();
    writeFileSync(SPLIT_RECEIPT, `${JSON.stringify({
      scope: 'fcr-access-public-worker-split',
      splitApplied: true,
      mutationOutcome: 'performed',
      sourceApplicationId: 'mixed-1',
      managedApplicationId: 'public-1',
      zone: FCR_PUBLIC_ZONE,
      originalDestinations: mixedApp().destinations,
    })}\n`, 'utf8');

    await assert.rejects(
      rollback(envFor(HEAD_A, '301'), { fetchImpl: provider.fetchImpl }),
      (error) => error?.classification === 'split-rollback-head-mismatch',
    );
    assert.equal(provider.state.requests.length, 0);
  });
});

test('CLI post-create failure persists the apply identity so the CLI rollback accepts it', async () => {
  await inTempDirectory(async () => {
    const partial = {
      schemaVersion: 1,
      scope: 'fcr-access-public-worker-split',
      state: 'split-partial-needs-rollback',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      rollbackPerformed: false,
      zone: FCR_PUBLIC_ZONE,
      sourceApplicationId: 'mixed-1',
      managedApplicationId: 'public-1',
      originalDestinations: mixedApp().destinations,
      splitApplied: true,
    };
    const failingExecute = async () => {
      const error = new Error('synthetic post-create failure');
      error.classification = 'split-public-bypass-missing';
      error.mutationOutcome = 'performed';
      error.partialSplitReceipt = partial;
      throw error;
    };
    await assert.rejects(runFcrAccessSplitCli({
      command: 'apply',
      env: envFor(HEAD_A, '401'),
      execute: failingExecute,
    }));

    const persisted = JSON.parse(readFileSync(SPLIT_RECEIPT, 'utf8'));
    assert.equal(persisted.splitApplied, true);
    assert.equal(persisted.mutationOutcome, 'performed');
    assert.equal(persisted.managedApplicationId, 'public-1');
    assert.equal(persisted.originalDestinations.length, 2);
    assert.equal(persisted.expectedHeadSha, HEAD_A);

    let rollbackReceiptSeen = null;
    const rolled = await runFcrAccessSplitCli({
      command: 'rollback',
      env: envFor(HEAD_A, '402'),
      rollback: async ({ receipt }) => {
        rollbackReceiptSeen = receipt;
        return { ...receipt, state: 'rolled-back', rollbackPerformed: true, splitApplied: false };
      },
    });
    assert.equal(rollbackReceiptSeen.managedApplicationId, 'public-1');
    assert.equal(rolled.rollbackPerformed, true);
  });
});

test('no workflow executes the Access split scripts (manual-only)', () => {
  const workflowsDir = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const text = readFileSync(new URL(name, workflowsDir), 'utf8');
    assert.doesNotMatch(text, /fcr-access-public-worker-split|run-fcr-access-public-worker-split/, name);
  }
});
