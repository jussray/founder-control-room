import { ContainerProxy, Sandbox, getSandbox } from '@cloudflare/sandbox';

export { ContainerProxy };

export class InternalSandbox extends Sandbox {
  enableInternet = false;
}

type Env = {
  Sandbox: DurableObjectNamespace<InternalSandbox>;
  SANDBOX_ADMIN_TOKEN?: string;
  SANDBOX_SCOPE?: string;
};

type ExecRequest = {
  taskId?: unknown;
  argv?: unknown;
  cwd?: unknown;
};

const MAX_ARGS = 16;
const MAX_ARG_LENGTH = 512;
const MAX_OUTPUT_LENGTH = 16_384;
const EXEC_TIMEOUT_MS = 30_000;
const ALLOWED_EXECUTABLES = new Set(['node', 'npm', 'npx', 'git']);

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.SANDBOX_ADMIN_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

function parseTaskId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^sbx_[a-z0-9]{8,48}$/.test(normalized) ? normalized : null;
}

function parseArgv(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ARGS) return null;
  if (
    value.some(
      (item) =>
        typeof item !== 'string' ||
        item.length === 0 ||
        item.length > MAX_ARG_LENGTH ||
        item.includes('\u0000'),
    )
  ) {
    return null;
  }

  const argv = value as string[];
  return ALLOWED_EXECUTABLES.has(argv[0]) ? argv : null;
}

function parseCwd(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;

  const isWorkspacePath = value === '/workspace' || value.startsWith('/workspace/');
  if (!isWorkspacePath || value.includes('..') || value.length > 256) return null;
  return value;
}

function clamp(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_OUTPUT_LENGTH) : '';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'founder-control-room-sandbox',
        scope: env.SANDBOX_SCOPE || 'portfolio-control-plane',
        authorityMode: 'transport-only',
        executionAuthorityWired: false,
        internetEgress: false,
      });
    }

    if (url.pathname !== '/v1/exec') return json({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!env.SANDBOX_ADMIN_TOKEN) return json({ error: 'sandbox_not_configured' }, 503);
    if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return json({ error: 'json_required' }, 415);
    }

    let body: ExecRequest;
    try {
      body = (await request.json()) as ExecRequest;
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const taskId = parseTaskId(body.taskId);
    const argv = parseArgv(body.argv);
    const cwd = parseCwd(body.cwd);

    if (!taskId || !argv || cwd === null) {
      return json({ error: 'invalid_execution_request' }, 400);
    }

    const sandbox = getSandbox(env.Sandbox, taskId);

    try {
      const process = await sandbox.exec(argv, {
        cwd,
        timeout: EXEC_TIMEOUT_MS,
      });
      const output = await process.output({ encoding: 'utf8' });

      return json({
        ok: output.exitCode === 0,
        taskId,
        processId: process.id,
        exitCode: output.exitCode,
        timedOut: output.timedOut === true,
        truncated: output.truncated === true,
        stdout: clamp(output.stdout),
        stderr: clamp(output.stderr),
      });
    } catch (error) {
      console.error('CLOUDFLARE_SANDBOX_EXECUTION_FAILED', {
        taskId,
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      return json({ error: 'sandbox_execution_failed', taskId }, 502);
    } finally {
      await sandbox.destroy().catch(() => undefined);
    }
  },
};
