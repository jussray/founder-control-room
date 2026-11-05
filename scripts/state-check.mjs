#!/usr/bin/env node
// Compares a recorded PR state file with observed facts and prints a verdict.
// Usage: node scripts/state-check.mjs <state.json> <observed.json>
// The observed file is produced by whoever read GitHub (session or CI).
// This script never merges, approves, or writes anything. It only reports.

import { readFileSync } from 'node:fs';

export function checkState(state, observed) {
  const blockers = [];
  const notes = [];

  if (observed.headSha !== state.recordedHeadSha) {
    blockers.push(`head moved: recorded ${state.recordedHeadSha} observed ${observed.headSha}`);
  }
  if (observed.baseSha !== state.recordedBaseSha) {
    blockers.push(`base moved: recorded ${state.recordedBaseSha} observed ${observed.baseSha}`);
  }
  if (observed.draft !== false) {
    notes.push('PR is still a draft');
  }
  if (observed.mergeable === false) {
    blockers.push('PR is not mergeable (conflicts)');
  }

  const conclusions = new Map((observed.checks ?? []).map((c) => [c.name, c.conclusion]));
  for (const name of state.requiredChecks) {
    const conclusion = conclusions.get(name);
    if (conclusion === undefined) blockers.push(`required check not reported: ${name}`);
    else if (conclusion !== 'success') blockers.push(`required check not successful: ${name} (${conclusion})`);
  }

  if (state.independentReview.required && !state.independentReview.recorded) {
    blockers.push('independent review required and not recorded');
  }

  const approval = state.founderMergeApproval;
  if (!approval.approved) {
    blockers.push('no founder merge approval recorded');
  } else if (approval.headSha !== observed.headSha || approval.baseSha !== observed.baseSha) {
    blockers.push('founder approval names a different head or base; it does not apply');
  }

  for (const dep of state.dependencies ?? []) {
    if (dep.state !== 'merged') notes.push(`dependency ${dep.repository}#${dep.pullNumber} is ${dep.state}`);
  }

  const verdict = blockers.length === 0 && notes.length === 0 ? 'READY' : blockers.length === 0 ? 'READY_WITH_NOTES' : 'BLOCKED';
  return { verdict, blockers, notes };
}

function main(argv) {
  const [statePath, observedPath] = argv;
  if (!statePath || !observedPath) {
    console.error('usage: node scripts/state-check.mjs <state.json> <observed.json>');
    return 2;
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const observed = JSON.parse(readFileSync(observedPath, 'utf8'));
  const result = checkState(state, observed);
  console.log(JSON.stringify(result, null, 2));
  return result.verdict === 'BLOCKED' ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
