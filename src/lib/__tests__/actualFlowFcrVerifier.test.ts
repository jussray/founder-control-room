import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ACTUAL-FLOW V5.2 signed evidence contract', () => {
  it('executes all nine exact-byte, pinned-key and fail-closed Node verification tests', () => {
    // Keep the core Node test suite separately runnable while ensuring the
    // existing FCR Vitest JSON reporter and Quality Gate artifact stay intact.
    const result = spawnSync(
      process.execPath,
      ['--test', resolve('test/actual-flow-fcr-verify.test.mjs')],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1_000_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/(?:^|\n)\s*[#ℹ]\s*tests\s+9\s*(?:\n|$)/);
    expect(result.stdout).toMatch(/(?:^|\n)\s*[#ℹ]\s*pass\s+9\s*(?:\n|$)/);
    expect(result.stdout).toMatch(/(?:^|\n)\s*[#ℹ]\s*fail\s+0\s*(?:\n|$)/);
  });
});
