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

type ProbeRequest = {
  taskId?: unknown;
};

const MAX_OUTPUT_LENGTH = 4_096;
const EXEC_TIMEOUT_MS = 10_000;
const PROBE_ARGV = Object.freeze([
  'node',
  '-e',
  'process.stdout.write("cloudflare-sandbox-ok")',
]);

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
        genericExecutionEnabled: false,
        internetEgress: false,
      });
    }

    if (url.pathname === '/v1/exec') {
      return json({ error: 'execution_authority_not_wired' }, 403);
    }

    if (url.pathname !== '/v1/probe') return json({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!env.SANDBOX_ADMIN_TOKEN) return json({ error: 'sandbox_not_configured' }, 503);
    if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return json({ error: 'json_required' }, 415);
    }

    let body: ProbeRequest;
    try {
      body = (await request.json()) as ProbeRequest;
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const taskId = parseTaskId(body.taskId);
    if (!taskId) return json({ error: 'invalid_probe_request' }, 400);

    const sandbox = getSandbox(env.Sandbox, taskId);

    try {
      const process = await sandbox.exec([...PROBE_ARGV], {
        timeout: EXEC_TIMEOUT_MS,
      });
      const output = await process.output({ encoding: 'utf8' });
      const stdout = clamp(output.stdout);

      return json({
        ok: output.exitCode === 0 && stdout === 'cloudflare-sandbox-ok',
        taskId,
        processId: process.id,
        exitCode: output.exitCode,
        timedOut: output.timedOut === true,
        truncated: output.truncated === true,
        stdout,
        stderr: clamp(output.stderr),
      });
    } catch (error) {
      console.error('CLOUDFLARE_SANDBOX_PROBE_FAILED', {
        taskId,
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      return json({ error: 'sandbox_probe_failed', taskId }, 502);
    } finally {
      await sandbox.destroy().catch(() => undefined);
    }
  },
};
