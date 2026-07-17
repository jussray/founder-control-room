import { realpath } from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { getTerminalCommand, listTerminalCommands } from './registry.js';
import {
  TerminalRunnerError,
  type TerminalCommandSpec,
  type TerminalRunRequest,
  type TerminalRunResult,
  type TerminalRunStatus,
} from './types.js';

const SAFE_BASE_ENV = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'CI',
  'NODE_ENV',
  'PLAYWRIGHT_BROWSERS_PATH',
] as const;

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY|ACCESS_KEY)/i;
const TOKEN_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{12,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

type CommandResolver = (
  projectSlug: string,
  commandId: string,
) => TerminalCommandSpec | undefined;

interface CaptureResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
}

export class GuardedTerminalRunner {
  private readonly activeByProject = new Map<string, string>();
  private readonly childrenByRun = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly cancelledRuns = new Set<string>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly commandResolver: CommandResolver = getTerminalCommand,
  ) {}

  list(projectSlug: string): TerminalCommandSpec[] {
    return listTerminalCommands(projectSlug);
  }

  async run(request: TerminalRunRequest): Promise<TerminalRunResult> {
    const command = this.commandResolver(request.projectSlug, request.commandId);
    if (!command) {
      throw new TerminalRunnerError(
        'UNKNOWN_COMMAND',
        `Command "${request.commandId}" is not approved for project "${request.projectSlug}".`,
      );
    }

    if (!/^[0-9a-f]{40}$/i.test(request.expectedCommitSha)) {
      throw new TerminalRunnerError(
        'INVALID_HEAD_SHA',
        'expectedCommitSha must be a full 40-character Git commit SHA.',
      );
    }

    const activeRun = this.activeByProject.get(request.projectSlug);
    if (activeRun) {
      throw new TerminalRunnerError(
        'PROJECT_BUSY',
        `Project "${request.projectSlug}" already has active terminal run ${activeRun}.`,
      );
    }

    this.activeByProject.set(request.projectSlug, request.runId);
    const startedAt = new Date().toISOString();

    try {
      const cwd = await this.resolveCommandCwd(command.relativeCwd);
      const observedCommitSha = await this.readHead(cwd);
      if (observedCommitSha !== request.expectedCommitSha.toLowerCase()) {
        throw new TerminalRunnerError(
          'HEAD_MISMATCH',
          `Workspace HEAD ${observedCommitSha} does not match expected ${request.expectedCommitSha.toLowerCase()}.`,
        );
      }

      const result = await this.captureProcess(
        request.runId,
        command.executable,
        command.args,
        cwd,
        command.timeoutMs,
        command.maxOutputBytes,
        this.buildEnvironment(command.allowedEnvNames ?? []),
      );

      const status: TerminalRunStatus = result.cancelled
        ? 'cancelled'
        : result.timedOut
          ? 'timed_out'
          : result.exitCode === 0
            ? 'passed'
            : 'failed';

      return {
        runId: request.runId,
        projectSlug: request.projectSlug,
        commandId: request.commandId,
        status,
        observedCommitSha,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: this.redact(result.stdout),
        stderr: this.redact(result.stderr),
        outputTruncated: result.outputTruncated,
      };
    } finally {
      this.activeByProject.delete(request.projectSlug);
      this.childrenByRun.delete(request.runId);
      this.cancelledRuns.delete(request.runId);
    }
  }

  cancel(runId: string): boolean {
    const child = this.childrenByRun.get(runId);
    if (!child) return false;
    this.cancelledRuns.add(runId);
    return this.terminate(child, 'SIGTERM');
  }

  private terminate(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): boolean {
    const pid = child.pid;
    if (!pid) return false;

    // npm scripts and Playwright launch child processes. On POSIX, each run is
    // started as its own process group so cancellation and timeout clean up the
    // whole command tree rather than leaving a Vite server or browser behind.
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, signal);
        return true;
      } catch {
        // The group may have exited between lookup and signal; fall back to the
        // direct child so the operation still fails closed.
      }
    }

    return child.kill(signal);
  }

  private async resolveCommandCwd(relativeCwd: string): Promise<string> {
    if (!this.workspaceRoot.trim()) {
      throw new TerminalRunnerError(
        'WORKSPACE_NOT_CONFIGURED',
        'CONTROL_ROOM_WORKSPACE_ROOT is not configured.',
      );
    }

    try {
      const root = await realpath(this.workspaceRoot);
      const candidate = await realpath(resolve(root, relativeCwd));
      if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
        throw new TerminalRunnerError(
          'WORKSPACE_ESCAPE',
          `Resolved project path escapes the configured workspace root: ${relativeCwd}`,
        );
      }
      return candidate;
    } catch (error) {
      if (error instanceof TerminalRunnerError) throw error;
      throw new TerminalRunnerError(
        'WORKSPACE_MISSING',
        `Project workspace "${relativeCwd}" is unavailable beneath CONTROL_ROOM_WORKSPACE_ROOT.`,
      );
    }
  }

  private async readHead(cwd: string): Promise<string> {
    const result = await this.captureProcess(
      `head:${cwd}`,
      'git',
      ['rev-parse', 'HEAD'],
      cwd,
      10_000,
      16_384,
      this.buildEnvironment([]),
      false,
    );

    if (result.exitCode !== 0) {
      throw new TerminalRunnerError(
        'SPAWN_FAILED',
        `Unable to resolve Git HEAD: ${this.redact(result.stderr).trim() || 'git exited non-zero'}`,
      );
    }

    const sha = result.stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(sha)) {
      throw new TerminalRunnerError('SPAWN_FAILED', 'git rev-parse returned an invalid commit SHA.');
    }
    return sha;
  }

  private captureProcess(
    runId: string,
    executable: string,
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    maxOutputBytes: number,
    env: NodeJS.ProcessEnv,
    trackForCancellation = true,
  ): Promise<CaptureResult> {
    return new Promise((resolvePromise, rejectPromise) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(executable, [...args], {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          detached: process.platform !== 'win32',
          stdio: 'pipe',
        });
        child.stdin.end();
      } catch (error) {
        rejectPromise(
          new TerminalRunnerError(
            'SPAWN_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        );
        return;
      }

      if (trackForCancellation) this.childrenByRun.set(runId, child);

      let stdout = '';
      let stderr = '';
      let capturedBytes = 0;
      let outputTruncated = false;
      let timedOut = false;
      let settled = false;

      const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
        const remaining = Math.max(0, maxOutputBytes - capturedBytes);
        if (remaining === 0) {
          outputTruncated = true;
          return;
        }
        const accepted = chunk.subarray(0, remaining);
        capturedBytes += accepted.byteLength;
        if (accepted.byteLength < chunk.byteLength) outputTruncated = true;
        if (target === 'stdout') stdout += accepted.toString('utf8');
        else stderr += accepted.toString('utf8');
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));

      const forceKillTimer = { current: null as NodeJS.Timeout | null };
      const timeout = setTimeout(() => {
        timedOut = true;
        this.terminate(child, 'SIGTERM');
        forceKillTimer.current = setTimeout(() => this.terminate(child, 'SIGKILL'), 2_000);
      }, timeoutMs);

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer.current) clearTimeout(forceKillTimer.current);
        rejectPromise(new TerminalRunnerError('SPAWN_FAILED', error.message));
      });

      child.once('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer.current) clearTimeout(forceKillTimer.current);
        resolvePromise({
          exitCode,
          signal,
          stdout,
          stderr,
          outputTruncated,
          timedOut,
          cancelled: this.cancelledRuns.has(runId),
        });
      });
    });
  }

  private buildEnvironment(allowedEnvNames: readonly string[]): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { CI: '1' };
    for (const name of [...SAFE_BASE_ENV, ...allowedEnvNames]) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    return env;
  }

  private redact(value: string): string {
    let redacted = value;
    for (const [name, secret] of Object.entries(process.env)) {
      if (!secret || secret.length < 8 || !SECRET_NAME.test(name)) continue;
      redacted = redacted.split(secret).join('[REDACTED]');
    }
    for (const pattern of TOKEN_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED_TOKEN]');
    }
    return redacted;
  }
}
