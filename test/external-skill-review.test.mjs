import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkillReview } from '../scripts/external-skill-review.mjs';
const input = { archive: '/local/skill.zip', artifactSha256: 'a'.repeat(64), image: 'skillspector@sha256:' + 'b'.repeat(64) };
const report = () => ({ execution_successful: true, analysis_completeness: { status: 'complete', is_complete: true }, metadata: { llm_requested: false, skillspector_version: '2.13.7' }, risk_assessment: { score: 0, severity: 'LOW', recommendation: 'SAFE' }, issues: [], components: [{ path: 'SKILL.md' }] });
const response = () => ({ status: 'report-received', artifactSha256: input.artifactSha256, image: input.image, reportSha256: 'c'.repeat(64), report: report() });
test('clean report yields review evidence only, without raw report disclosure', () => {
  const r = runSkillReview(input, response);
  assert.equal(r.status, 'static-review-passed');
  assert.equal(r.executionAllowed, false);
  assert.equal(r.reportSha256, 'c'.repeat(64));
  assert.equal('report' in r, false);
});
test('wrong scope or scanner version blocks', () => {
  for (const patch of [{artifactSha256:'d'.repeat(64)}, {image:'different'}, {reportSha256:'bad'}, {report:{...report(),metadata:{llm_requested:false,skillspector_version:'other'}}}]) {
    assert.equal(runSkillReview(input, () => ({...response(), ...patch})).status, 'blocked');
  }
});
test('incomplete reports and unavailable scanner block', () => {
  assert.equal(runSkillReview(input, () => ({...response(),report:{}})).status,'blocked');
  assert.equal(runSkillReview(input, () => ({status:'blocked',reason:'scanner-failed'})).status,'blocked');
  assert.equal(runSkillReview(input, () => { throw new Error('secret'); }).status,'blocked');
});
