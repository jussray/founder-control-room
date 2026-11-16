import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCiExperiment, REQUIRED_JOBS } from '../scripts/ci-autoresearch.mjs';
const BASE = 'a'.repeat(40);
const CANDIDATE = 'b'.repeat(40);
const start = Date.parse('2026-11-06T00:00:00.000Z');
const stamp = (ms) => new Date(start + ms).toISOString();
const sample = (headSha, runId, totalMs = 120_000) => ({
  headSha, runId, workflow: 'CI', event: 'pull_request', runnerImage: 'ubuntu-latest', testSuiteFingerprint: 'ci-suite-v1',
  createdAt: stamp(0), completedAt: stamp(totalMs),
  jobs: REQUIRED_JOBS.map((name, i) => ({name, conclusion:'success', startedAt:stamp(30_000),completedAt:stamp(Math.min(totalMs - 1000, 45_000 + i * 500))})),
  vitest: {total: 100, passed:100, failed:0, pending:0, todo:0, assertionProof:true},
  securityGatePassed:true, authorityGatePassed:true,
});
const fixture = () => ({baseline:[1,2,3].map(i=>sample(BASE,i,120_000)),candidate:[4,5,6].map(i=>sample(CANDIDATE,i,100_000))});
test('keeps faster exact-head candidate for founder review only', () => {
  const x=evaluateCiExperiment(fixture());
  assert.equal(x.decision, 'KEEP_CANDIDATE_FOR_REVIEW');
  assert.ok(x.improvementPct >= 5);
  assert.equal(x.authority, 'EVALUATION_ONLY_NO_MERGE_OR_DEPLOY');
  assert.equal(x.baseline.queueMs, 30_000);
});
test('does not judge from one successful run', () => {
  const x=fixture();x.baseline=x.baseline.slice(0,1);x.candidate=x.candidate.slice(0,1);
  assert.equal(evaluateCiExperiment(x).decision,'INSUFFICIENT_EVIDENCE');
});
test('rejects a slower candidate', () => {
  const x=fixture();x.candidate.forEach(r=>{r.completedAt=stamp(130_000)});
  assert.equal(evaluateCiExperiment(x).decision,'REJECT_EXPERIMENT');
});
test('fails closed on missing required job', () => {
  const x=fixture();x.candidate[0].jobs=x.candidate[0].jobs.filter(j=>j.name!=='Required Gate');
  assert.match(evaluateCiExperiment(x).reason,/Required Gate/);
  assert.equal(evaluateCiExperiment(x).decision,'BLOCKED');
});
test('fails closed on skip, absent assertion proof, or reduced test count', () => {
  for(const edit of [r=>r.vitest.pending=1,r=>r.vitest.assertionProof=false,r=>{r.vitest.total=90;r.vitest.passed=90}]){
    const x=fixture();edit(x.candidate[0]);assert.equal(evaluateCiExperiment(x).decision,'BLOCKED');
  }
});
test('fails closed on differing suites and duplicate IDs', () => {
  const x=fixture();x.candidate[0].testSuiteFingerprint='weaker-suite';
  assert.equal(evaluateCiExperiment(x).decision,'BLOCKED');
  const y=fixture();y.candidate[0].runId=1;
  assert.equal(evaluateCiExperiment(y).decision,'BLOCKED');
});
test('fails closed when checks fail or authority is missing', () => {
  const x=fixture();x.candidate[0].jobs.find(j=>j.name==='Test').conclusion='failure';
  assert.equal(evaluateCiExperiment(x).decision,'BLOCKED');
  const y=fixture();y.candidate[0].authorityGatePassed=false;
  assert.equal(evaluateCiExperiment(y).decision,'BLOCKED');
});
