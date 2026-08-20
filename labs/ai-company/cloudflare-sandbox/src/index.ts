import { getSandbox, Sandbox as SandboxBase } from '@cloudflare/sandbox';
import {
  authenticateInvocation,
  deriveSandboxSessionId,
  deriveSubjectGateId,
  type SandboxInvocation,
} from './auth-core.mjs';
import { SandboxRequestGate } from './gate.mjs';

export class Sandbox extends SandboxBase {
  enableInternet = false;
}

export { SandboxRequestGate } from './gate.mjs';

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  SandboxRequestGate: DurableObjectNamespace;
  SANDBOX_RUNNER_HMAC_KEY?: string;
};

type GateDecision = { code?: string };

const SYNTHETIC_EVIDENCE_COMMAND =
  'python3 -c "import json; print(json.dumps({\'kind\': \'synthetic-evidence\', \'authority\': \'L0\', \'liveSideEffects\': False}))"';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

async function consumeInvocation(env: Env, invocation: SandboxInvocation) {
  const gateId = env.SandboxRequestGate.idFromName(await deriveSubjectGateId(invocation.subject));
  const gate = env.SandboxRequestGate.get(gateId);
  const response = await gate.fetch('https://sandbox-gate.internal/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce: invocation.nonce, issuedAt: invocation.issuedAt }),
  });
  const decision = await response.json<GateDecision>().catch(() => ({}));
  return { response, code: decision.code ?? 'gate_rejected' };
}

async function executeSyntheticEvidence(env: Env, invocation: SandboxInvocation) {
  const sandbox = getSandbox(env.Sandbox, await deriveSandboxSessionId(invocation));
  let response: Response;
  let cleanupFailed = false;

  try {
    const result = await sandbox.exec(SYNTHETIC_EVIDENCE_COMMAND);
    response = result.success && result.exitCode === 0
      ? json({
        status: 'simulated',
        authority: 'L0',
        liveSideEffects: false,
        persistence: 'ephemeral',
      })
      : json({ code: 'sandbox_execution_failed' }, 502);
  } catch {
    response = json({ code: 'sandbox_execution_failed' }, 502);
  } finally {
    try {
      await sandbox.destroy();
    } catch {
      cleanupFailed = true;
    }
  }

  return cleanupFailed ? json({ code: 'sandbox_cleanup_failed' }, 502) : response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authentication = await authenticateInvocation(request, env.SANDBOX_RUNNER_HMAC_KEY);
    if (!authentication.ok) {
      const status = authentication.code === 'sandbox_unconfigured'
        ? 503
        : authentication.code === 'method_not_allowed'
          ? 405
          : 404;
      return json({ code: authentication.code }, status);
    }

    const gate = await consumeInvocation(env, authentication.invocation);
    if (!gate.response.ok) {
      return json({ code: gate.code }, gate.response.status);
    }

    return executeSyntheticEvidence(env, authentication.invocation);
  },
};
