import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_REQUIRED_RULESET_ID,
  readFcrRequiredRuleset,
  assessRequiredGate,
  summarizeSkippedEvidence,
} from '../scripts/required-gate-evidence.mjs';

const SHA = 'a'.repeat(40);
const validRule = {
  id: FCR_REQUIRED_RULESET_ID, target: 'branch', enforcement: 'active',
  rules: [{ type: 'required_status_checks', parameters: {
    required_status_checks: [
      { context: 'Required Gate', integration_id: 34548 },
      { context: 'Delete Neon Branch', integration_id: 15368 },
      ...Array.from({ length: 17 }, (_, i) => ({ context: 'Historical check ' + i, integration_id: 15368 })),
    ],
  } }],
};
function row(name, state, appId = '15368', headSha = SHA) {
  return { id: '42', name, state, appId, headSha,
    app: 'github-actions', conclusion: state === 'skipped' ? 'skipped' : 'success',
    detailsUrl: 'https://github.com/jussray/founder-control-room/actions/runs/42' };
}

test('reads active founder main ruleset from GitHub rather than a fabricated 19-check list', async () => {
  const requests = [];
  const result = await readFcrRequiredRuleset({
    repository: 'jussray/founder-control-room', token: 'test-only',
    getJson: async (url) => { requests.push(String(url)); return validRule; },
  });
  assert.equal(result.topology, 'legacy_single');
  assert.equal(result.expectedCount, 19);
  assert.deepEqual(result.requiredChecks.slice(0, 2), [
    { context: 'Required Gate', integrationId: '34548' },
    { context: 'Delete Neon Branch', integrationId: '15368' },
  ]);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/rulesets/' + FCR_REQUIRED_RULESET_ID));
  await assert.rejects(readFcrRequiredRuleset({
    repository: 'jussray/founder-control-room', token: 'test-only',
    getJson: async () => ({ ...validRule, enforcement: 'disabled' }),
  }), /UNAVAILABLE_OR_CHANGED/);
  await assert.rejects(readFcrRequiredRuleset({
    repository: 'another/repo', token: 'test-only',
    getJson: async () => validRule,
  }), /INPUT_INVALID/);
});

test('the exact-head 19-context gate does not convert missing or skipped into pass', () => {
  const required = {
    requiredChecks: Array.from({ length: 19 }, (_, i) => ({
      context: 'Requirement ' + i,
      integrationId: '15368',
    })),
  };
  const checks = [
    row('Requirement 0', 'passed'),
    row('Requirement 1', 'skipped'),
    row('Requirement 2', 'passed', '99999'),
    row('Requirement 3', 'passed', '15368', 'b'.repeat(40)),
    row('Requirement 4', 'failed'),
    row('Requirement 5', 'queued'),
  ];
  const proof = assessRequiredGate(required, checks, SHA);
  assert.equal(proof.status, 'blocked');
  assert.deepEqual(proof.counts, { passed: 1, missing: 15, skipped: 1, pending: 1, failed: 1, unknown: 0 });
  assert.equal(proof.rows.find((x) => x.context === 'Requirement 2').state, 'missing');
  assert.equal(proof.rows.find((x) => x.context === 'Requirement 3').state, 'missing');
  assert.equal(proof.authority, 'observational_only');
});

test('all 19 exact-SHA app-bound successful contexts may be covered, never auto-authorized', () => {
  const required = { requiredChecks: Array.from({ length: 19 }, (_, i) => ({
    context: 'Check ' + i, integrationId: '15368',
  })) };
  const checks = required.requiredChecks.map((r) => row(r.context, 'passed'));
  const proof = assessRequiredGate(required, checks, SHA);
  assert.equal(proof.status, 'covered');
  assert.equal(proof.counts.passed, 19);
  assert.equal(proof.authority, 'observational_only');
  assert.equal(assessRequiredGate(null, checks, SHA).status, 'unknown');
  assert.equal(assessRequiredGate({ requiredChecks: required.requiredChecks.slice(1) }, checks, SHA).status, 'ruleset_drift');
  assert.equal(assessRequiredGate(required, [...checks, row('Check 0', 'failed')], SHA).rows[0].state, 'ambiguous');
});

test('skipped jobs remain individually visible but cannot count as proof', () => {
  const checks = [row('Delete Neon Branch', 'skipped'), row('Required Gate', 'passed', '34548')];
  const skips = summarizeSkippedEvidence(checks);
  assert.equal(skips.length, 1);
  assert.equal(skips[0].name, 'Delete Neon Branch');
  assert.equal(skips[0].evidenceOfPassingCheck, false);
  assert.equal(skips[0].reasonVerified, false);
  assert.equal(assessRequiredGate(null, checks, SHA).counts, null);
});

test('reconciled zero-bypass two-membrane policy remains observable after the 19-check rule is fixed', async () => {
  const strictId = 987654;
  const review = { ...validRule, rules: [{ type: 'pull_request' }] };
  const strict = {
    id: strictId, name: 'Founder Control Room main exact-head gate [strict freshness]',
    enforcement: 'active', target: 'branch',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    bypass_actors: [],
    rules: [{ type: 'required_status_checks', parameters: {
      strict_required_status_checks_policy: true,
      required_status_checks: [
        { context: 'Required Gate', integration_id: 15368 },
        { context: 'Verify test-ledger contract', integration_id: 15368 },
      ],
    } }],
  };
  const source = async (url) => {
    if (url.pathname.endsWith('/20819094')) return review;
    if (url.pathname.endsWith('/' + strictId)) return strict;
    if (url.pathname.endsWith('/rulesets')) return [
      { id: 20819094, name: 'Founder Control Room main exact-head gate' },
      { id: strictId, name: strict.name },
    ];
    throw Error('Unexpected provider read ' + url.pathname);
  };
  const actual = await readFcrRequiredRuleset({
    repository: 'jussray/founder-control-room', token: 'test-only', getJson: source,
  });
  assert.equal(actual.topology, 'canonical_split');
  assert.equal(actual.expectedCount, 2);
  const successful = [row('Required Gate', 'passed', '15368'),
    row('Verify test-ledger contract', 'passed', '15368')];
  assert.equal(assessRequiredGate(actual, successful, SHA).status, 'covered');
  assert.equal(assessRequiredGate(actual, successful.slice(0, 1), SHA).status, 'blocked');
  const legacy = { topology: 'legacy_single', expectedCount: 19,
    requiredChecks: Array.from({length: 19}, (_, i) => ({ context: 'Check ' + i, integrationId: '15368' })) };
  assert.equal(assessRequiredGate(legacy, legacy.requiredChecks.map(x => row(x.context, 'passed')), SHA).status,
    'legacy_covered_not_canonical');
  await assert.rejects(readFcrRequiredRuleset({
    repository: 'jussray/founder-control-room', token: 'test-only',
    getJson: async (url) => url.pathname.endsWith('/20819094') ? review : [],
  }), /STRICT_MEMBRANE_MISSING/);
  await assert.rejects(readFcrRequiredRuleset({
    repository: 'jussray/founder-control-room', token: 'test-only',
    getJson: async (url) => url.pathname.endsWith('/20819094') ? review
      : url.pathname.endsWith('/rulesets') ? [{ id: strictId, name: strict.name }]
        : { ...strict, bypass_actors: [{ actor_id: 1 }] },
  }), /STRICT_MEMBRANE_INVALID/);
});
