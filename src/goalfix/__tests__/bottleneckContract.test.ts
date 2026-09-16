import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url);

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, ROOT), 'utf8');
}

describe('Goalfix bottleneck contract', () => {
  it('keeps the canonical adaptive kernel bottleneck-first', async () => {
    const kernel = await read('docs/FOUNDER_ADAPTIVE_KERNEL_V0.md');

    expect(kernel).toMatch(/DETECT CURRENT BOTTLENECK/);
    expect(kernel).toMatch(/smallest safe bottleneck removal/i);
    expect(kernel).toMatch(/proof.*must not become a permanent freeze/i);
    expect(kernel).toMatch(/frozen unrelated capabilities/i);
    expect(kernel).toMatch(/No bottleneck scan, no serious optimization claim/i);
  });

  it.each([
    '.ai/skills/goalfix/SKILL.md',
    '.claude/skills/goalfix/SKILL.md',
  ])('keeps portable Goalfix behavior bottleneck-aware: %s', async (path) => {
    const skill = await read(path);

    expect(skill).toMatch(/CURRENT BOTTLENECK/);
    expect(skill).toMatch(/SMALLEST SAFE BOTTLENECK REMOVAL/);
    expect(skill).toMatch(/DETECT CURRENT BOTTLENECK/);
    expect(skill).toMatch(/BOTTLENECK[\s\S]*classification.*current limiting constraint/i);
    expect(skill).toMatch(/unrelated capabilities.*current proof and authority/i);
  });
});
