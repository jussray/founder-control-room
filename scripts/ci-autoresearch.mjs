#!/usr/bin/env node
// Read-only CI experiment evaluation. No repository/provider mutations.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REQUIRED_JOBS = Object.freeze([
  'Type check', 'Lint', 'Test', 'Playwright e2e', 'Python tests',
  'RLS migration contract', 'Test discovery ratchet', 'Documentation truth',
  'Cloudflare bridge authority contract', 'Migration lint', 'Required Gate',
]);
const SHA = /^[0-9a-f]{40}$/;
const failure = (reason) => ({ decision: 'BLOCKED', reason });
const validMillis = (value) => Number.isFinite(Date.parse(value));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

function validateSample(run) {
  if (!run || !SHA.test(run.headSha ?? '') || !Number.isSafeInteger(run.runId) || run.runId < 1) {
    return 'invalid exact-head SHA or run ID';
  }
  if (run.workflow !== 'CI' || run.event !== 'pull_request' || !run.runnerImage || !run.testSuiteFingerprint) {
    return 'wrong workflow, event, runner, or test-suite identity';
  }
  if (![run.createdAt, run.completedAt].every(validMillis) || Date.parse(run.completedAt) <= Date.parse(run.createdAt)) {
    return 'invalid workflow timing';
  }
  if (!Array.isArray(run.jobs)) return 'missing job evidence';
  const jobs = new Map();
  for (const job of run.jobs) {
    if (!job || typeof job.name !== 'string' || jobs.has(job.name)) return 'duplicate or malformed job';
    if (!validMillis(job.startedAt) || !validMillis(job.completedAt) || Date.parse(job.completedAt) < Date.parse(job.startedAt)) {
      return 'missing or invalid job timing';
    }
    if (Date.parse(job.startedAt) < Date.parse(run.createdAt) || Date.parse(job.completedAt) > Date.parse(run.completedAt)) {
      return 'job timing is outside workflow window';
    }
    jobs.set(job.name, job);
  }
  for (const name of REQUIRED_JOBS) {
    if (!jobs.has(name) || jobs.get(name).conclusion !== 'success') return 'required job missing or not successful: ' + name;
  }
  const t = run.vitest;
  if (!t || !Number.isSafeInteger(t.total) || t.total < 1 || t.passed !== t.total ||
      t.failed !== 0 || t.pending !== 0 || t.todo !== 0 || t.assertionProof !== true) {
    return 'complete exact-head executed-test proof is missing or nonpassing';
  }
  if (run.securityGatePassed !== true || run.authorityGatePassed !== true) return 'security or authority evidence missing';
  return null;
}

function metrics(run) {
  const start = Math.min(...run.jobs.map(job => Date.parse(job.startedAt)));
  const finish = Math.max(...run.jobs.map(job => Date.parse(job.completedAt)));
  return {
    totalMs: Date.parse(run.completedAt) - Date.parse(run.createdAt),
    queueMs: start - Date.parse(run.createdAt),
    executionWindowMs: finish - start,
  };
}

export function evaluateCiExperiment(input) {
  const a = input?.baseline, b = input?.candidate;
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return failure('baseline and candidate samples are required');
  const all = [...a, ...b];
  const ids = new Set();
  for (const run of all) {
    const error = validateSample(run);
    if (error) return failure(error);
    if (ids.has(run.runId)) return failure('duplicate run ID');
    ids.add(run.runId);
  }
  const same = (key) => all.every(run => run[key] === all[0][key]);
  if (!same('runnerImage') || !same('testSuiteFingerprint')) return failure('test suite or runner is not comparable');
  if (!a.every(run => run.headSha === a[0].headSha) || !b.every(run => run.headSha === b[0].headSha) || a[0].headSha === b[0].headSha) {
    return failure('baseline and candidate must be different consistent exact heads');
  }
  if (Math.min(...b.map(run => run.vitest.total)) < Math.max(...a.map(run => run.vitest.total))) {
    return failure('candidate executed fewer tests');
  }
  if (a.length < 3 || b.length < 3) return { decision: 'INSUFFICIENT_EVIDENCE', reason: 'at least three exact-head runs per side required' };
  const baseline = Object.fromEntries(['totalMs', 'queueMs', 'executionWindowMs'].map(k => [k, median(a.map(run => metrics(run)[k]))]));
  const candidate = Object.fromEntries(['totalMs', 'queueMs', 'executionWindowMs'].map(k => [k, median(b.map(run => metrics(run)[k]))]));
  const improvementPct = Math.round((1 - candidate.totalMs / baseline.totalMs) * 1000) / 10;
  return {
    decision: improvementPct >= 5 ? 'KEEP_CANDIDATE_FOR_REVIEW' : 'REJECT_EXPERIMENT',
    reason: improvementPct >= 5 ? 'median workflow duration improved without lowering required evidence' : 'median workflow duration failed the 5% improvement threshold',
    baseline, candidate, improvementPct,
    evidence: { baselineHead: a[0].headSha, candidateHead: b[0].headSha, baselineRuns: a.map(r => r.runId), candidateRuns: b.map(r => r.runId) },
    authority: 'EVALUATION_ONLY_NO_MERGE_OR_DEPLOY',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: node scripts/ci-autoresearch.mjs evidence.json');
    const result = evaluateCiExperiment(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (result.decision === 'BLOCKED') process.exitCode = 1;
  } catch (error) {
    console.error('Autoresearch evidence invalid:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
