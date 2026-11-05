import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');
const workflow = source('.github/workflows/ai-failure-repair.yml');
const skill = source('.ai/skills/workflow-audit-repair/SKILL.md');

function violations(text) {
  const bad = [];
  if (/\bgit\s+(?:push|commit)\b/.test(text)) bad.push('unattended git mutation');
  if (/\bgh\s+pr\s+(?:create|merge)\b/.test(text)) bad.push('unattended PR mutation');
  if (/actions\/create-github-app-token|permission-contents:\s*write/.test(text)) bad.push('write token');
  for (const invariant of [
    'contents: read',
    'test "$(git rev-parse refs/remotes/origin/main)" = "$FAILED_SHA"',
    'git diff --binary > .repair/verified-candidate.patch',
    'test -s .repair/verified-candidate.patch',
    'sha256sum .repair/verified-candidate.patch',
    'CANDIDATE_VERIFIED_AWAITING_FOUNDER_REVIEW',
    'remoteWrite:false',
    'founderReviewRequired:true',
    'freshExactHeadCiRequiredAfterApply:true',
  ]) if (!text.includes(invariant)) bad.push('missing invariant: ' + invariant);
  return bad;
}

test('FCR repair produces evidence-bound candidate, not an automatic remote write', () => {
  assert.deepEqual(violations(workflow), []);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ai-repair-verified-candidate-/);
});

test('reject forbidden main push, PR creation, write token, and false-green mutations', () => {
  for (const example of [
    'git push origin HEAD:main',
    'git commit -m unattended',
    'gh pr create --title exploit',
    'uses: actions/create-github-app-token@123',
    'permission-contents: write',
  ]) assert.notDeepEqual(violations(workflow + '\n' + example), [], example);
});

test('reject empty, stale, unhashed, or falsely completed candidate', () => {
  for (const [a, b] of [
    ['test -s .repair/verified-candidate.patch', 'true'],
    ['sha256sum .repair/verified-candidate.patch', 'unhashed'],
    ['remoteWrite:false', 'remoteWrite:true'],
    ['freshExactHeadCiRequiredAfterApply:true', 'freshExactHeadCiRequiredAfterApply:false'],
    ['CANDIDATE_VERIFIED_AWAITING_FOUNDER_REVIEW', 'REPAIR_PUSHED'],
  ]) assert.notDeepEqual(violations(workflow.replace(a,b)), [], a);
});

test('coordinating skill limits authority, avoids duplicate runtime, and separates Chief AI', () => {
  for (const part of [
    'name: workflow-audit-repair', 'Only inspect explicitly authorized',
    'must not push any branch', 'Chief AI is a separate system',
    'Red Team II', 'docs/FOUNDER_MERGE_AUTHORITY.md',
  ]) assert.ok(skill.includes(part), part);
});
