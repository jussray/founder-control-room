import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/control-room-test-ledger.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('required test-ledger context owns terminal exact-head observation', () => {
  assert.match(workflow, /ledger-contract:\n\s+name: Verify test-ledger contract/);
  assert.match(workflow, /CONTROL_ROOM_LEDGER_SELF_CHECK: Verify test-ledger contract/);
  assert.match(workflow, /- name: Observe every exact-head check lane/);
  assert.match(workflow, /- name: Require stable exact-head ledger/);
  assert.match(workflow, /observerState !== 'stable'/);
  assert.match(workflow, /\['failed', 'queued', 'running', 'unknown'\]/);
  assert.match(workflow, /check\?\.name === 'Required Gate' && check\?\.state === 'passed'/);
  assert.doesNotMatch(workflow, /\n\s+publish-ledger:/);
});

test('required test-ledger context requires exact founder merge approval', () => {
  assert.match(workflow, /issues: read/);
  assert.match(workflow, /- name: Require exact founder merge approval/);
  assert.match(workflow, /FOUNDER_GITHUB_LOGIN: jussray/);
  assert.match(workflow, /fcr-founder-merge-approval:v1/);
  assert.match(workflow, /comment\.created_at !== comment\.updated_at/);
  assert.match(workflow, /receipt\?\.repository/);
  assert.match(workflow, /receipt\?\.pull_request/);
  assert.match(workflow, /receipt\?\.base_sha/);
  assert.match(workflow, /receipt\?\.head_sha/);
  assert.match(workflow, /\['approve', 'revoke'\]/);
  assert.match(workflow, /latest\.receipt\.decision !== 'approve'/);
  assert.match(workflow, /exactCandidateBound: true/);
  assert.match(workflow, /authorizesMerge: true/);
});

test('approval evidence is emitted as a separate receipt', () => {
  assert.match(workflow, /FOUNDER_MERGE_APPROVAL_PATH: artifacts\/founder-merge-approval\.json/);
  assert.match(workflow, /artifacts\/control-room-test-ledger\.json/);
  assert.match(workflow, /artifacts\/founder-merge-approval\.json/);
  assert.match(workflow, /if-no-files-found: warn/);
});
