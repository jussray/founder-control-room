import { createHash } from 'node:crypto';
import { TerminalRunnerError, type TerminalRunRequest, type TerminalRunResult } from './types.js';

const REPOSITORY = 'jussray/founder-control-room';
const SCHEMA = 'fcr/sprite-read-only-terminal@v1';
const SPRITE = 'fcr-governed-exec';
const URL = `https://api.sprites.dev/v1/sprites/${SPRITE}/exec`;
const SCRIPT = '/home/sprite/fcr/runner/read-only-terminal-stdio.cjs';
const COMMAND_IDS = new Set(['git.head', 'git.status', 'git.diff-stat']);
const MAX_RESPONSE_BYTES = 16_384;

export interface SpriteExecResponse {
  status: number;
  body: string;
}

export type SpriteTransport = (
  url: string,
  options: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'manual' },
) => Promise<SpriteExecResponse>;

function reject(code: 'UNKNOWN_COMMAND' | 'INVALID_HEAD_SHA' | 'PROJECT_BUSY' | 'SPAWN_FAILED', message: string): never {
  throw new TerminalRunnerError(code, message);
}

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') reject('SPAWN_FAILED', 'Invalid Sprite receipt.');
  return value as Record<string, unknown>;
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseSpriteResponse(raw: string): Record<string, unknown> {
  // The Sprite exec API may stream stdout as plain text or numbered control frames.
  // Never infer success from an HTTP 200, an empty stream, or an unrecognized event.
  const candidates = raw.replace(/[\u0000-\u001f]/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  for (const line of candidates.reverse()) {
    try {
      const obj = exactObject(JSON.parse(line));
      if (obj['result'] === 'PASS' && typeof obj['receipt'] === 'object') return obj;
    } catch { /* Non-receipt frame. */ }
  }
  return reject('SPAWN_FAILED', 'Sprite proof receipt unavailable or invalid.');
}

const defaultTransport: SpriteTransport = async (url, options) => {
  const response = await fetch(url, options);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, body: '' };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        reject('SPAWN_FAILED', 'Sprite output exceeded the maximum allowed size.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return { status: response.status, body: new TextDecoder().decode(result) };
};

export class SpriteReadOnlyRunner {
  private readonly activeProjects = new Set<string>();
  constructor(
    private readonly token: string,
    private readonly transport: SpriteTransport = defaultTransport,
  ) {}

  cancel(_runId: string): boolean {
    // No remote-cancellation guarantee. The call is bounded; do not claim cancellation.
    return false;
  }

  async run(request: TerminalRunRequest): Promise<TerminalRunResult> {
    if (request.projectSlug !== 'founder-control-room' || !COMMAND_IDS.has(request.commandId)) {
      reject('UNKNOWN_COMMAND', 'Sprite supports FCR Git observations only.');
    }
    if (!/^[a-f0-9]{40}$/.test(request.expectedCommitSha)) {
      reject('INVALID_HEAD_SHA', 'A lowercase exact 40-character HEAD is required.');
    }
    if (!/^[a-zA-Z0-9._-]{8,96}$/.test(request.runId)) {
      reject('SPAWN_FAILED', 'Invalid run identity.');
    }
    if (!this.token || /\s/.test(this.token) || this.token.length < 12) {
      reject('SPAWN_FAILED', 'Sprites execution credential unavailable.');
    }
    if (this.activeProjects.has(request.projectSlug)) {
      reject('PROJECT_BUSY', 'An FCR Sprite observation is already in progress.');
    }

    this.activeProjects.add(request.projectSlug);
    const startedAt = new Date().toISOString();
    const job = {
      schema: SCHEMA,
      repository: REPOSITORY,
      expectedHeadSha: request.expectedCommitSha,
      requestId: request.runId,
      commandId: request.commandId,
    };
    try {
      const query = new URLSearchParams();
      for (const value of ['node', SCRIPT]) query.append('cmd', value);
      query.set('stdin', 'true');
      query.set('dir', '/home/sprite/fcr/runner');
      const response = await this.transport(`${URL}?${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: JSON.stringify(job),
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 200 || Buffer.byteLength(response.body, 'utf8') > MAX_RESPONSE_BYTES) {
        reject('SPAWN_FAILED', 'Sprite provider call failed or exceeded output bounds.');
      }
      const result = parseSpriteResponse(response.body);
      const receipt = exactObject(result['receipt']);
      const output = receipt['observedOutput'];
      if (request.commandId === 'git.head' && output !== request.expectedCommitSha) {
        reject('SPAWN_FAILED', 'Sprite observed HEAD did not match the requested head.');
      }
      if (receipt['contract'] !== SCHEMA || receipt['repo'] !== REPOSITORY ||
          receipt['requestId'] !== request.runId || receipt['commandId'] !== request.commandId ||
          receipt['exactHeadSha'] !== request.expectedCommitSha ||
          receipt['mergeAuthorized'] !== false || receipt['deploymentAuthorized'] !== false ||
          receipt['privilegedAuthorityTransferred'] !== false ||
          typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > 8192 ||
          receipt['outputDigestSha256'] !== digest(output) ||
          receipt['intentFingerprintSha256'] !== digest(JSON.stringify(job))) {
        reject('SPAWN_FAILED', 'Sprite proof did not bind the approved exact request.');
      }

      return {
        runId: request.runId,
        projectSlug: request.projectSlug,
        commandId: request.commandId,
        observedCommitSha: request.expectedCommitSha,
        status: 'passed',
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: 0,
        signal: null,
        stdout: output,
        stderr: '',
        outputTruncated: false,
      };
    } catch (error) {
      if (error instanceof TerminalRunnerError) throw error;
      // Do not log token, transport response, network details or provider stack.
      return reject('SPAWN_FAILED', 'Sprite read-only execution outcome is unknown.');
    } finally {
      this.activeProjects.delete(request.projectSlug);
    }
  }
}
