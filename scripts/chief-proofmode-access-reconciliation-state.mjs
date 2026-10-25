import { readFileSync } from 'node:fs';

const MARKER_V2 = /<!-- chief-proofmode-access-reconciliation:v2 target=(?<target>https:\/\/[^ ]+) disposition=(?<disposition>CLEAR|REPAIR_IN_PROGRESS|RECONCILE_REQUIRED) subject=(?<subject>pending|sha256:[0-9a-f]{64}) head=(?<head>[0-9a-f]{40}) run=(?<run>[0-9]+) -->/g;
const MARKER_V1 = /<!-- chief-proofmode-access-reconciliation:v1 target=(?<target>https:\/\/[^ ]+) disposition=(?<disposition>CLEAR|REPAIR_IN_PROGRESS|RECONCILE_REQUIRED) head=(?<head>[0-9a-f]{40}) run=(?<run>[0-9]+) -->/g;

function flattenComments(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (Array.isArray(entry) ? flattenComments(entry) : [entry]));
}

function parseMarkers(comments, regex, version) {
  const markers = [];
  for (const comment of comments) {
    if (comment?.user?.login !== 'github-actions[bot]') continue;
    const body = typeof comment?.body === 'string' ? comment.body : '';
    for (const match of body.matchAll(regex)) {
      markers.push({
        version,
        commentId: Number(comment.id || 0),
        ...match.groups,
      });
    }
  }
  return markers.sort((a, b) => a.commentId - b.commentId);
}

export function evaluateChiefAccessReconciliation(rawComments, target) {
  const comments = flattenComments(rawComments);
  const legacy = parseMarkers(comments, MARKER_V1, 1).filter((marker) => marker.target === target);
  const latestLegacy = legacy.at(-1);
  const v2 = parseMarkers(comments, MARKER_V2, 2).filter((marker) => marker.target === target);

  if (v2.length === 0) {
    return {
      clear: !latestLegacy || latestLegacy.disposition === 'CLEAR',
      mode: 'legacy-v1',
      blockedSubjects: latestLegacy && latestLegacy.disposition !== 'CLEAR' ? [`legacy-run:${latestLegacy.run}`] : [],
      inProgressRuns: latestLegacy?.disposition === 'REPAIR_IN_PROGRESS' ? [latestLegacy.run] : [],
    };
  }

  const unresolvedSubjects = new Set();
  const inProgressRuns = new Set();
  const inProgressSubjects = new Map();
  let legacyBlocked = Boolean(latestLegacy && latestLegacy.disposition !== 'CLEAR');
  if (legacyBlocked && latestLegacy) {
    unresolvedSubjects.add(`legacy-run:${latestLegacy.run}`);
    if (latestLegacy.disposition === 'REPAIR_IN_PROGRESS') inProgressRuns.add(latestLegacy.run);
  }

  for (const marker of v2) {
    if (
      legacyBlocked
      && latestLegacy
      && marker.commentId > latestLegacy.commentId
      && marker.disposition === 'CLEAR'
      && marker.subject === 'pending'
    ) {
      unresolvedSubjects.delete(`legacy-run:${latestLegacy.run}`);
      inProgressRuns.delete(latestLegacy.run);
      legacyBlocked = false;
    }
    if (marker.disposition === 'REPAIR_IN_PROGRESS') {
      inProgressRuns.add(marker.run);
      inProgressSubjects.set(marker.run, marker.subject);
      continue;
    }

    if (marker.disposition === 'RECONCILE_REQUIRED') {
      inProgressRuns.delete(marker.run);
      inProgressSubjects.delete(marker.run);
      if (marker.subject === 'pending') {
        unresolvedSubjects.add(`pending-run:${marker.run}`);
      } else {
        unresolvedSubjects.add(marker.subject);
      }
      continue;
    }

    if (marker.disposition === 'CLEAR') {
      inProgressRuns.delete(marker.run);
      inProgressSubjects.delete(marker.run);
      if (marker.subject === 'pending') {
        unresolvedSubjects.delete(`pending-run:${marker.run}`);
      } else {
        unresolvedSubjects.delete(marker.subject);
      }
    }
  }

  return {
    clear: unresolvedSubjects.size === 0 && inProgressRuns.size === 0,
    mode: 'subject-v2',
    blockedSubjects: [...unresolvedSubjects],
    inProgressRuns: [...inProgressRuns],
    inProgress: [...inProgressRuns].map((run) => ({
      run,
      subject: inProgressSubjects.get(run) ?? 'pending',
    })),
  };
}

function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Exact Chief target is required.');
  const raw = readFileSync(0, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  const state = evaluateChiefAccessReconciliation(parsed, target);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(state)}\n`);
    return;
  }
  process.stdout.write(state.clear ? 'CLEAR\n' : 'BLOCKED\n');
  if (!state.clear) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    process.stdout.write('BLOCKED\n');
    process.exitCode = 2;
  }
}
