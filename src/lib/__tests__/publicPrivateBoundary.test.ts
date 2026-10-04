import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const MAX_PUBLIC_STUB_BYTES = 768;

function trackedPrivatePaths(): string[] {
  const output = execFileSync('git', ['ls-files', 'docs/private'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return output ? output.split('\n').map((value) => value.trim()).filter(Boolean) : [];
}

describe('public/private repository boundary', () => {
  it('allows only bounded public pointer stubs under docs/private', () => {
    const tracked = trackedPrivatePaths();
    expect(tracked.length).toBeGreaterThan(0);

    for (const relativePath of tracked) {
      const content = readFileSync(resolve(root, relativePath), 'utf8');
      expect(content).toContain('PUBLIC_STUB_ONLY');
      expect(content).toContain('intentionally not stored in this public repository');
      expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(MAX_PUBLIC_STUB_BYTES);
    }
  });
});
