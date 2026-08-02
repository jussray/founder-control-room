import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SANDBOX_IMAGE = 'founder-control-room/ai-company-process-sandbox:test';
export const CONTAINER_SANDBOX_LIMITS = Object.freeze({
  timeoutMs: 3_000,
  maxInputBytes: 32 * 1024,
  maxOutputBytes: 64 * 1024,
  memory: '64m',
  memorySwap: '64m',
  cpus: '0.50',
  pids: '32',
});

const CONTEXT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const NODE_PERMISSION_ARGS = Object.freeze([
  '--permission',
  '--allow-fs-read=/sandbox',
  '--disable-proto=throw',
  '--no-addons',
  '--no-global-search-paths',
  '--no-experimental-websocket',
  '--max-old-space-size=32',
]);

function dockerEnvironment(extra = {}) {
  const environment = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    ...extra,
  };
  if (process.env.DOCKER_HOST) environment.DOCKER_HOST = process.env.DOCKER_HOST;
  return environment;
}

export function buildContainerRunArgs(image = DEFAULT_SANDBOX_IMAGE, entrypoint = null) {
  const args = [
    'run',
    '--rm',
    '--interactive',
    '--network',
    'none',
    '--ipc',
    'none',
    '--read-only',
    '--memory',
    CONTAINER_SANDBOX_LIMITS.memory,
    '--memory-swap',
    CONTAINER_SANDBOX_LIMITS.memorySwap,
    '--cpus',
    CONTAINER_SANDBOX_LIMITS.cpus,
    '--pids-limit',
    CONTAINER_SANDBOX_LIMITS.pids,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--user',
    '65534:65534',
    '--workdir',
    '/sandbox',
  ];

  if (entrypoint) args.push('--entrypoint', entrypoint);
  args.push(image);
  return args;
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? CONTAINER_SANDBOX_LIMITS.timeoutMs;
  const maxOutputBytes = options.maxOutputBytes ?? CONTAINER_SANDBOX_LIMITS.maxOutputBytes;
  const stdin = options.stdin ?? '';

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? dockerEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;

    const kill = () => {
      if (!child.killed) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.byteLength > maxOutputBytes) {
        outputExceeded = true;
        kill();
        return next.subarray(0, maxOutputBytes);
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({
        exitCode,
        signal,
        timedOut,
        outputExceeded,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      });
    });

    child.stdin.end(stdin);
  });
}

function parseSingleJsonLine(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  if (lines.length !== 1) throw new Error('sandbox must emit exactly one JSON line');
  return JSON.parse(lines[0]);
}

export async function buildContainerImage(image = DEFAULT_SANDBOX_IMAGE) {
  const run = await runCommand(
    'docker',
    ['build', '--pull', '--tag', image, CONTEXT_DIRECTORY],
    {
      timeoutMs: 120_000,
      maxOutputBytes: 2 * 1024 * 1024,
      env: dockerEnvironment(),
    },
  );
  if (run.exitCode !== 0 || run.timedOut || run.outputExceeded) {
    throw new Error(`sandbox image build failed: ${run.stderr || run.stdout}`);
  }
  return Object.freeze({ image, built: true });
}

export async function runSyntheticEmployeeContainer(request, options = {}) {
  const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
  const input = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(input, 'utf8') > CONTAINER_SANDBOX_LIMITS.maxInputBytes) {
    return Object.freeze({
      version: 'container-execution-receipt-v1',
      status: 'blocked',
      violations: ['host_input_too_large'],
      worker: null,
    });
  }

  const run = await runCommand('docker', buildContainerRunArgs(image), {
    stdin: input,
    timeoutMs: options.timeoutMs ?? CONTAINER_SANDBOX_LIMITS.timeoutMs,
    maxOutputBytes: options.maxOutputBytes ?? CONTAINER_SANDBOX_LIMITS.maxOutputBytes,
    env: dockerEnvironment(options.hostEnvironment),
  });

  if (run.timedOut) {
    return Object.freeze({
      version: 'container-execution-receipt-v1',
      status: 'blocked',
      violations: ['hard_deadline_exceeded'],
      worker: null,
    });
  }
  if (run.outputExceeded) {
    return Object.freeze({
      version: 'container-execution-receipt-v1',
      status: 'blocked',
      violations: ['output_limit_exceeded'],
      worker: null,
    });
  }

  let worker;
  try {
    worker = parseSingleJsonLine(run.stdout);
  } catch {
    return Object.freeze({
      version: 'container-execution-receipt-v1',
      status: 'blocked',
      violations: ['invalid_worker_receipt'],
      worker: null,
    });
  }

  return Object.freeze({
    version: 'container-execution-receipt-v1',
    status: worker.status,
    boundary: Object.freeze({
      type: 'docker-container',
      network: 'none',
      rootFilesystem: 'read-only',
      inheritedHostEnvironment: false,
      user: '65534:65534',
      capabilitiesDropped: 'ALL',
      noNewPrivileges: true,
      memory: CONTAINER_SANDBOX_LIMITS.memory,
      memorySwap: CONTAINER_SANDBOX_LIMITS.memorySwap,
      cpus: CONTAINER_SANDBOX_LIMITS.cpus,
      pids: CONTAINER_SANDBOX_LIMITS.pids,
    }),
    exitCode: run.exitCode,
    signal: run.signal,
    worker,
  });
}

function entrypointArgs(image, entryFile) {
  return [
    ...buildContainerRunArgs(image, 'node'),
    ...NODE_PERMISSION_ARGS,
    `/sandbox/${entryFile}`,
  ];
}

export async function runIsolationProbe(options = {}) {
  const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
  const run = await runCommand('docker', entrypointArgs(image, 'probe-entry.mjs'), {
    timeoutMs: 2_000,
    maxOutputBytes: 16 * 1024,
    env: dockerEnvironment({ SYNTHETIC_HOST_SECRET: 'must-not-enter-container' }),
  });
  if (run.exitCode !== 0 || run.timedOut || run.outputExceeded) {
    throw new Error(`container probe failed: ${run.stderr || run.stdout}`);
  }
  return Object.freeze(parseSingleJsonLine(run.stdout));
}

export async function runDeadlineProbe(options = {}) {
  const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
  const run = await runCommand('docker', entrypointArgs(image, 'hang-entry.mjs'), {
    timeoutMs: options.timeoutMs ?? 250,
    maxOutputBytes: 4 * 1024,
    env: dockerEnvironment(),
  });
  return Object.freeze({
    timedOut: run.timedOut,
    signal: run.signal,
    exitCode: run.exitCode,
  });
}
