import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeChecks, mergeEvidence } from '../juss-and-co-status-sync.mjs';

test('summarizeChecks classifies runs', () => {
  assert.equal(summarizeChecks([]), 'no checks');
  assert.equal(summarizeChecks([{ conclusion: 'success' }, { conclusion: 'skipped' }, { conclusion: 'neutral' }]), 'green');
  assert.equal(summarizeChecks([{ conclusion: 'success' }, { conclusion: 'failure' }, { conclusion: 'timed_out' }]), 'red (2 failing)');
  assert.equal(summarizeChecks([{ conclusion: null, status: 'in_progress' }, { conclusion: 'success' }]), 'running');
});

test('mergeEvidence never touches founder-declared fields and reports change', () => {
  const current = { generatedAt: '2026-01-01T00:00:00Z', worlds: [{ name: 'A', repo: 'x/a', st: 'live', label: 'Live', contact: { email: '[E]' }, evidence: {} }, { name: 'B', repo: 'x/b', st: 'soon', label: 'Opening soon', evidence: { mainSha: 'old' } }] };
  const { next, changed } = mergeEvidence(current, { A: { mainSha: 'abc', ci: 'green' } }, new Date('2026-09-30T00:00:00Z'));
  assert.equal(changed, true);
  assert.equal(next.generatedAt, '2026-09-30T00:00:00.000Z');
  assert.deepEqual(next.worlds[0].evidence, { mainSha: 'abc', ci: 'green' });
  assert.equal(next.worlds[0].st, 'live'); assert.equal(next.worlds[0].label, 'Live'); assert.deepEqual(next.worlds[0].contact, { email: '[E]' });
  assert.deepEqual(next.worlds[1].evidence, { mainSha: 'old' });
  const again = mergeEvidence(next, { A: { mainSha: 'abc', ci: 'green' } });
  assert.equal(again.changed, false);
  assert.equal(again.next.generatedAt, next.generatedAt);
});
