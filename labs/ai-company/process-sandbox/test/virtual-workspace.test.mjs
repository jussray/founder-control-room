import assert from 'node:assert/strict';
import test from 'node:test';
import { stageVirtualWorkspaceEdit } from '../virtual-workspace.mjs';

const SHA = 'a'.repeat(40);
const source = 'export const state = "pending";\n';
const candidate = () => ({
  dataClassification: 'synthetic',
  repository: 'jussray/founder-control-room',
  sourceSha: SHA,
  branch: 'feat/founder-os-container-bridge',
  files: [{ path: 'src/example.ts', content: source }],
  edits: [{ path: 'src/example.ts', find: '"pending"', replace: '"verified"' }],
});

test('stages deterministic edits with an independent sanitized receipt', () => {
  const input = candidate();
  const first = stageVirtualWorkspaceEdit(input);
  assert.deepEqual(first, stageVirtualWorkspaceEdit(input));
  assert.equal(first.artifacts[0].content, 'export const state = "verified";\n');
  assert.equal(input.files[0].content, source);
  assert.equal(first.receipt.status, 'staged');
  assert.equal(first.receipt.externalExecutionAllowed, false);
  assert.equal(first.receipt.filesystemWrites, false);
  assert.equal(first.receipt.sourceBranchWrites, false);
  assert.ok(!JSON.stringify(first.receipt).includes('export const'));
  assert.match(first.receipt.changes[0].afterSha256, /^[0-9a-f]{64}$/);
});

test('blocks stale source, repeated matches, and no-op edits', () => {
  for (const bad of [{ find: '"old"' }, { replace: '"pending"' }]) {
    const input = candidate();
    Object.assign(input.edits[0], bad);
    assert.throws(() => stageVirtualWorkspaceEdit(input));
  }
  const input = candidate();
  input.files[0].content += source;
  assert.throws(() => stageVirtualWorkspaceEdit(input), /exact-text match/);
});

test('blocks unsafe paths, protected default branches, and false source identity', () => {
  for (const path of ['../.env', '.github/workflows/ci.yml', 'src/../../.env', 'docs/secrets/key.pem', 'src/.env.local']) {
    const input = candidate();
    input.files[0].path = path;
    input.edits[0].path = path;
    assert.throws(() => stageVirtualWorkspaceEdit(input));
  }
  for (const field of [{ branch: 'main' }, { sourceSha: 'short' }, { dataClassification: 'private' }]) {
    assert.throws(() => stageVirtualWorkspaceEdit({ ...candidate(), ...field }));
  }
});

test('rejects all edits atomically when one of multiple edits is invalid', () => {
  const input = candidate();
  input.files.push({ path: 'docs/example.md', content: 'before\n' });
  input.edits.push({ path: 'docs/example.md', find: 'missing', replace: 'after' });
  assert.throws(() => stageVirtualWorkspaceEdit(input));
  assert.equal(input.files[0].content, source);
});

test('blocks oversized source and duplicated source paths', () => {
  const input = candidate();
  input.files[0].content = 'x'.repeat(16385);
  assert.throws(() => stageVirtualWorkspaceEdit(input), /at most/);
  const duplicate = candidate();
  duplicate.files.push({ ...duplicate.files[0] });
  assert.throws(() => stageVirtualWorkspaceEdit(duplicate), /duplicated/);
});


test('preserves repository-source identity while editing only in memory', () => {
  const input = { ...candidate(), dataClassification: 'repository-source' };
  const result = stageVirtualWorkspaceEdit(input);
  assert.equal(result.receipt.sourceClassification, 'repository-source');
  assert.equal(result.receipt.sourceBranchWrites, false);
  assert.equal(result.receipt.externalExecutionAllowed, false);
  assert.equal(result.artifacts[0].content, 'export const state = "verified";\n');
  assert.equal(input.files[0].content, source);
});


test('stages replacement tokens literally without JavaScript substitution', () => {
  const tokens = ['$&', '$$', "$'", '$' + String.fromCharCode(96)];
  for (const replacement of [...tokens, tokens.join(' / ')]) {
    const input = candidate();
    input.files[0].content = 'start old end';
    input.edits[0] = { path: 'src/example.ts', find: 'old', replace: replacement };
    const staged = stageVirtualWorkspaceEdit(input);
    assert.equal(staged.artifacts[0].content, 'start ' + replacement + ' end');
    assert.notEqual(staged.receipt.changes[0].beforeSha256, staged.receipt.changes[0].afterSha256);
    assert.equal(input.files[0].content, 'start old end');
  }
});

test('preserves indentation and trailing newline in exact search text', () => {
  const input = candidate();
  input.files[0].content = 'head\n  old\nfooter\n';
  input.edits[0] = { path: 'src/example.ts', find: '  old\n', replace: '  new\n' };
  const staged = stageVirtualWorkspaceEdit(input);
  assert.equal(staged.artifacts[0].content, 'head\n  new\nfooter\n');
  assert.equal(input.files[0].content, 'head\n  old\nfooter\n');
});

test('rejects blank exact-match search text without changing the source', () => {
  for (const find of ['', ' ', '\n']) {
    const input = candidate();
    input.edits[0] = { path: 'src/example.ts', find, replace: 'new' };
    assert.throws(() => stageVirtualWorkspaceEdit(input), /edit.find is required/);
    assert.equal(input.files[0].content, source);
  }
});
