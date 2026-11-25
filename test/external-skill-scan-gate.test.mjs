import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStaticScan } from '../scripts/external-skill-scan-gate.mjs';

const clean = () => ({
  execution_successful: true,
  analysis_completeness: { status: 'complete', is_complete: true },
  risk_assessment: { score: 0, severity: 'LOW', recommendation: 'SAFE' },
  metadata: { llm_requested: false, skillspector_version: 'fixture' },
  components: [{ path: 'SKILL.md' }], issues: [],
});

test('complete clean static scan is only eligible for further review', () => {
  const result = reviewStaticScan(clean(), 0);
  assert.equal(result.staticReviewPassed, true);
  assert.equal(result.executionAllowed, false);
});
test('invalid reports and process failures block', () => {
  for (const [report, code] of [[null, 0], [{}, 0], [clean(), 1], [clean(), 2]]) {
    assert.equal(reviewStaticScan(report, code).staticReviewPassed, false);
  }
});
test('partial coverage, wrong scope, and caution block', () => {
  for (const patch of [
    { analysis_completeness: { status: 'partial', is_complete: false } },
    { metadata: { llm_requested: true, skillspector_version: 'fixture' } },
    { risk_assessment: { score: 40, severity: 'MEDIUM', recommendation: 'CAUTION' } },
    { issues: [{ id: 'finding' }] },
    { components: [] },
    { suppressed: [{ id: 'hidden' }] },
    { skills: [] },
  ]) assert.equal(reviewStaticScan({ ...clean(), ...patch }, 0).staticReviewPassed, false);
});
