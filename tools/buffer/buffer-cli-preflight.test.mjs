import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBufferCli } from './buffer-cli-preflight.mjs';

test('preflight runs only four fixed read-only commands and redacts output', () => {
  const calls = [];
  const fakeRun = (executable, args, opts) => {
    calls.push([executable, args, opts]);
    return { status: 0, stdout: 'BUFFER_API_KEY=secret-value', stderr: 'private account' };
  };
  const result = inspectBufferCli(fakeRun);
  assert.deepEqual(calls.map(([, args]) => args), [
    ['--version'], ['doctor'], ['account', '--output', 'json'], ['channels', 'list', '--output', 'json'],
  ]);
  assert.equal(calls.every(([exe]) => exe === 'buffer'), true);
  assert.equal(calls.every(([, , opts]) => opts.stdio[0] === 'ignore'), true);
  assert.doesNotMatch(JSON.stringify(result), /secret-value|private account/);
  assert.equal(result.providerPublication, 'not-attempted');
});

test('absent binary or failed token checks are reported as failure not proof', () => {
  const r = inspectBufferCli(() => ({ error: new Error('ENOENT'), status: null, stdout: 'secret' }));
  assert.equal(r.checks.every((x) => x.ok === false), true);
  assert.equal(r.providerAuthenticated, 'not-proven-by-execution-alone');
});
