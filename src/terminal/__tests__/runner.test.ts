import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuardedTerminalRunner } from '../runner.js';
import { TerminalRunnerError, type TerminalCommandSpec } from '../types.js';

const PROJECT = 'test-project';
const COMMAND = 'verify.test';

function command(overrides: Partial<TerminalCommandSpec> = {}): TerminalCommandSpec {
  return {
    id: COMMAND,
    label: 'Test command',
    projectSlug: PROJECT,
    executable: process.execPath,
    args: ['-e', 'console.log("ok")'],
    relativeCwd: 'project',
    risk: 'verify',
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    evidenceKind: 'unit_test',
    allowedEnvNames: [],
    ...overrides,
  };
}

function resolver(spec: TerminalCommandSpec) {
  return (projectSlug: string, commandId: string) =>
    projectSlug === spec.projectSlug && commandId === spec.id ? spec : undefined;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe('GuardedTerminalRunner', () => {
  let root: string;
  let projectDir: string;
  let headSha: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'control-room-terminal-'));
    projectDir = join(root, 'project');
    await mkdir(projectDir, { recursive: true });
    git(projectDir, 'init');
    git(projectDir, 'config', 'user.email', 'terminal-test@example.com');
    git(projectDir, 'config', 'user.name', 'Terminal Test');
    await writeFile(join(projectDir, 'README.md'), '# fixture\n', 'utf8');
    git(projectDir, 'add', 'README.md');
    git(projectDir, 'commit', '-m', 'fixture');
    headSha = git(projectDir, 'rev-parse', 'HEAD').toLowerCase();
  });

  afterEach(async () => {
    delete process.env.TEST_TERMINAL_SECRET;
    await rm(root, { recursive: true, force: true });
  });

  it('runs an allowlisted executable without a shell and binds the exact head', async () => {
    const spec = command();
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    const result = await runner.run({
      runId: 'run-success',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    });

    expect(result.status).toBe('passed');
    expect(result.observedCommitSha).toBe(headSha);
    expect(result.stdout).toContain('ok');
  });

  it('rejects commands that are not in the registry', async () => {
    const runner = new GuardedTerminalRunner(root, () => undefined);
    await expect(runner.run({
      runId: 'run-unknown',
      projectSlug: PROJECT,
      commandId: 'bash',
      expectedCommitSha: headSha,
    })).rejects.toMatchObject<TerminalRunnerError>({ code: 'UNKNOWN_COMMAND' });
  });

  it('rejects stale or incorrect commit identities', async () => {
    const spec = command();
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    await expect(runner.run({
      runId: 'run-stale',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: 'a'.repeat(40),
    })).rejects.toMatchObject<TerminalRunnerError>({ code: 'HEAD_MISMATCH' });
  });

  it('blocks working-directory traversal outside the configured workspace', async () => {
    const outside = `${root}-outside`;
    await mkdir(outside, { recursive: true });
    const spec = command({ relativeCwd: join('..', basename(outside)) });
    const runner = new GuardedTerminalRunner(root, resolver(spec));

    try {
      await expect(runner.run({
        runId: 'run-escape',
        projectSlug: PROJECT,
        commandId: COMMAND,
        expectedCommitSha: headSha,
      })).rejects.toMatchObject<TerminalRunnerError>({ code: 'WORKSPACE_ESCAPE' });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('caps output and reports truncation', async () => {
    const spec = command({
      args: ['-e', 'process.stdout.write("x".repeat(10000))'],
      maxOutputBytes: 1024,
    });
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    const result = await runner.run({
      runId: 'run-output-cap',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    });

    expect(result.status).toBe('passed');
    expect(result.outputTruncated).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024);
  });

  it('redacts allowlisted secret values from output', async () => {
    process.env.TEST_TERMINAL_SECRET = 'terminal-secret-value-12345';
    const spec = command({
      args: ['-e', 'console.log(process.env.TEST_TERMINAL_SECRET)'],
      allowedEnvNames: ['TEST_TERMINAL_SECRET'],
    });
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    const result = await runner.run({
      runId: 'run-redaction',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    });

    expect(result.stdout).not.toContain('terminal-secret-value-12345');
    expect(result.stdout).toContain('[REDACTED]');
  });

  it('times out long-running commands', async () => {
    const spec = command({
      args: ['-e', 'setTimeout(() => {}, 10000)'],
      timeoutMs: 100,
    });
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    const result = await runner.run({
      runId: 'run-timeout',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    });

    expect(result.status).toBe('timed_out');
  });

  it('allows one active run per project and supports cancellation', async () => {
    const spec = command({
      args: ['-e', 'setTimeout(() => {}, 10000)'],
      timeoutMs: 20_000,
    });
    const runner = new GuardedTerminalRunner(root, resolver(spec));
    const first = runner.run({
      runId: 'run-first',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));

    await expect(runner.run({
      runId: 'run-second',
      projectSlug: PROJECT,
      commandId: COMMAND,
      expectedCommitSha: headSha,
    })).rejects.toMatchObject<TerminalRunnerError>({ code: 'PROJECT_BUSY' });

    expect(runner.cancel('run-first')).toBe(true);
    const result = await first;
    expect(result.status).toBe('cancelled');
  });
});
