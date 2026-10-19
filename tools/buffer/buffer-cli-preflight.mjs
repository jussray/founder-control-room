#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SAFE_READS = Object.freeze([
  { id: 'version', args: ['--version'] },
  { id: 'doctor', args: ['doctor'] },
  { id: 'account', args: ['account', '--output', 'json'] },
  { id: 'channels', args: ['channels', 'list', '--output', 'json'] },
]);

/** Read-only Buffer CLI diagnostic. No mutation arguments, no secret output. */
export function inspectBufferCli(run = spawnSync) {
  return {
    contract: 'fcr/buffer-cli-readonly-preflight@v1',
    checks: SAFE_READS.map(({ id, args }) => {
      const response = run('buffer', args, {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 262144,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      return {
        check: id,
        ok: !response.error && response.status === 0,
        exitCode: response.error ? null : response.status,
        // Never forward token, account, channel, or doctor stdout/stderr.
      };
    }),
    providerAuthenticated: 'not-proven-by-execution-alone',
    providerPublication: 'not-attempted',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(inspectBufferCli(), null, 2));
}
