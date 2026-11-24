import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runStaticScan } from '../scripts/external-skill-runner.mjs';

const image = 'skillspector@sha256:' + 'a'.repeat(64);
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fcr-fixture-'));
  try {
    const archive = join(dir, 'skill.zip');
    const bytes = Buffer.from('fixture archive');
    writeFileSync(archive, bytes);
    return fn({ archive, artifactSha256: createHash('sha256').update(bytes).digest('hex'), image });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('runs only pinned local image with restricted container arguments', () => fixture(input => {
  let calls = 0;
  const result = runStaticScan(input, (cmd, args, options) => {
    calls++;
    assert.equal(cmd, '/usr/bin/docker');
    for (const flag of ['--network=none','--read-only','--cap-drop=ALL','--pull=never','--no-llm']) assert.ok(args.includes(flag));
    assert.equal(options.shell, false);
    assert.ok(args.includes(image));
    return { status: 0, stdout: '{"fixture":true}' };
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'report-received');
  assert.equal(result.executionAllowed, false);
}));
test('rejects mutable image or wrong artifact digest before starting scanner', () => fixture(input => {
  const never = () => { throw new Error('must not start'); };
  assert.equal(runStaticScan({...input, image:'skillspector:latest'}, never).status, 'blocked');
  assert.equal(runStaticScan({...input, artifactSha256:'b'.repeat(64)}, never).status, 'blocked');
}));
test('blocks process failures, timeouts and invalid JSON', () => fixture(input => {
  for (const response of [{status:1,stdout:'{}'}, {status:null,error:new Error('timeout')}, {status:0,stdout:'bad'}, {status:0,stdout:'null'}]) {
    assert.equal(runStaticScan(input, () => response).status, 'blocked');
  }
}));
