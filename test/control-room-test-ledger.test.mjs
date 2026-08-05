import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateTestLedger,
  buildTestLedger,
  mapCheckState,
  selectLatestChecks,
} from '../scripts/control-room-test-ledger.mjs';

const SHA = '019f405030af7d79cde420cc504a060fdcaea29b';

function check(overrides = {}) {
  return {
    id: 1,
    name: 'Quality Gate',
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    started_at: '2026-08-04T20:00:00Z',
    completed_at: '2026-08-04T20:01:00Z',
    details_url: 'https://github.com/jussray/founder-control-room/actions/runs/1',
    app: {slug: 'github-actions', name: 'GitHub Actions'},
    ...overrides,
  };
}

test('maps provider check states without false green', () => {
  assert.equal(mapCheckState(check()), 'passed');
  assert.equal(mapCheckState(check({conclusion: 'skipped'})), 'skipped');
  assert.equal(mapCheckState(check({conclusion: 'neutral'})), 'skipped');
  assert.equal(mapCheckState(check({conclusion: 'failure'})), 'failed');
  assert.equal(mapCheckState(check({status: 'in_progress', conclusion: null})), 'running');
  assert.equal(mapCheckState(check({status: 'queued', conclusion: null})), 'queued');
  assert.equal(mapCheckState(check({status: 'completed', conclusion: null})), 'unknown');
});

test('keeps every latest exact-head check lane and excludes the observer', () => {
  const checks = selectLatestChecks([
    check({id: 1, name: 'Quality Gate', completed_at: '2026-08-04T20:01:00Z'}),
    check({id: 2, name: 'Quality Gate', conclusion: 'failure', completed_at: '2026-08-04T20:02:00Z'}),
    check({id: 3, name: 'Playwright', app: {slug: 'github-actions'}}),
    check({id: 4, name: 'Cloudflare Pages', app: {slug: 'cloudflare-pages'}}),
    check({id: 5, name: 'Publish exact-head test ledger'}),
    check({id: 6, name: 'Foreign SHA', head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}),
  ], SHA, 'Publish exact-head test ledger');

  assert.deepEqual(checks.map((item) => item.name), ['Cloudflare Pages', 'Playwright', 'Quality Gate']);
  assert.equal(checks.find((item) => item.name === 'Quality Gate')?.state, 'failed');
  assert.equal(checks.every((item) => item.headSha === SHA), true);
});

test('aggregates failed, pending, warning, unknown, and passed distinctly', () => {
  assert.equal(aggregateTestLedger([]).state, 'unknown');
  assert.equal(aggregateTestLedger([{state: 'passed'}]).state, 'passed');
  assert.equal(aggregateTestLedger([{state: 'passed'}, {state: 'skipped'}]).state, 'warning');
  assert.equal(aggregateTestLedger([{state: 'running'}]).state, 'pending');
  assert.equal(aggregateTestLedger([{state: 'failed'}, {state: 'passed'}]).state, 'failed');
});

test('builds a sanitized exact-SHA control-room ledger', () => {
  const checks = selectLatestChecks([check()], SHA);
  const ledger = buildTestLedger({
    repository: 'jussray/founder-control-room',
    sha: SHA.toUpperCase(),
    branch: 'main',
    runId: '30950000000',
    checks,
    observerState: 'stable',
    observedAt: new Date('2026-08-04T20:05:00Z'),
  });

  assert.equal(ledger.commitSha, SHA);
  assert.equal(ledger.aggregate.state, 'passed');
  assert.equal(ledger.source.includesAllDiscoveredChecks, true);
  assert.equal(ledger.source.excludesObserverCheck, true);
  assert.equal(ledger.runner.observerState, 'stable');
  assert.equal(ledger.runner.authoritativeForMerge, false);
  assert.equal(ledger.checks[0].detailsUrl.includes('github.com'), true);
  assert.equal(JSON.stringify(ledger).includes('token'), false);
});

test('reports failed native checks without becoming a duplicate merge authority', () => {
  const checks = selectLatestChecks([
    check({name: 'Cloudflare Pages', conclusion: 'failure', app: {slug: 'cloudflare-pages'}}),
    check({name: 'Unit Tests'}),
  ], SHA);
  const ledger = buildTestLedger({
    repository: 'jussray/founder-control-room',
    sha: SHA,
    branch: 'feature/test-ledger',
    runId: '30950000001',
    checks,
    observerState: 'stable',
  });

  assert.equal(ledger.aggregate.state, 'failed');
  assert.equal(ledger.aggregate.counts.failed, 1);
  assert.equal(ledger.runner.authoritativeForMerge, false);
});
