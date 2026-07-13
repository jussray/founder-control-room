import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@6';
import {
  ALLOWED_REF,
  ALLOWED_REPOSITORY,
  ALLOWED_WORKFLOW,
  OIDC_AUDIENCE,
  eventSeverity,
  evidenceStatus,
  validateStatusEnvelope,
} from './contract.ts';

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS = createRemoteJWKSet(
  new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),
  { cooldownDuration: 300_000, cacheMaxAge: 3_600_000 },
);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

function bearerToken(req: Request): string {
  const authorization = req.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('missing_bearer_token');
  return match[1].trim();
}

function claimString(payload: JWTPayload, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

async function authorizeGithubWorkflow(req: Request): Promise<JWTPayload> {
  const token = bearerToken(req);
  const { payload } = await jwtVerify(token, GITHUB_JWKS, {
    issuer: GITHUB_ISSUER,
    audience: OIDC_AUDIENCE,
    algorithms: ['RS256'],
  });

  const repository = claimString(payload, 'repository');
  const ref = claimString(payload, 'ref');
  const workflowRef = claimString(payload, 'workflow_ref');
  const eventName = claimString(payload, 'event_name');
  const subject = String(payload.sub || '');
  const expectedWorkflowRef = `${ALLOWED_REPOSITORY}/${ALLOWED_WORKFLOW}@${ALLOWED_REF}`;
  const expectedSubject = `repo:${ALLOWED_REPOSITORY}:ref:${ALLOWED_REF}`;

  if (repository !== ALLOWED_REPOSITORY) throw new Error('oidc_repository_denied');
  if (ref !== ALLOWED_REF) throw new Error('oidc_ref_denied');
  if (workflowRef !== expectedWorkflowRef) throw new Error('oidc_workflow_denied');
  if (subject !== expectedSubject) throw new Error('oidc_subject_denied');
  if (!['push', 'workflow_dispatch'].includes(eventName)) throw new Error('oidc_event_denied');
  if (!/^[a-f0-9]{40}$/.test(claimString(payload, 'sha'))) throw new Error('oidc_sha_invalid');

  return payload;
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  let key = '';
  if (modern) {
    try {
      key = String(JSON.parse(modern)?.default || '');
    } catch {
      throw new Error('supabase_secret_keys_invalid');
    }
  }
  key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('supabase_admin_configuration_missing');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'founder-control-room-l99-observer/1.0' } },
  });
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json(415, { error: 'content_type_must_be_application_json' });
  }
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > 32_768) return json(413, { error: 'payload_too_large' });

  try {
    const claims = await authorizeGithubWorkflow(req);
    const rawText = await req.text();
    if (rawText.length > 32_768) return json(413, { error: 'payload_too_large' });
    const rawPayload = JSON.parse(rawText);
    const envelope = validateStatusEnvelope(rawPayload, claimString(claims, 'sha'));
    const supabase = adminClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_identifier')
      .eq('slug', 'l99')
      .eq('repo_identifier', ALLOWED_REPOSITORY)
      .single();
    if (projectError || !project) throw new Error('l99_project_registration_missing');

    const sourceEventId = `github:${envelope.commit}:portfolio-status:v1`;
    const metadata = {
      schema_version: envelope.schema_version,
      repository: envelope.repository,
      commit: envelope.commit,
      observed_at: envelope.observed_at,
      status: envelope.status,
      risk_level: envelope.risk_level,
      gate_status: envelope.gate_status,
      gate_results: envelope.gate_results,
      proof_refs: envelope.proof_refs,
      blockers: envelope.blockers,
      next_gate: envelope.next_gate,
      source_run_id: envelope.source_run_id,
      source_run_attempt: envelope.source_run_attempt,
      authority: 'sanitized-read-only-observer',
    };

    const { error: eventError } = await supabase.from('project_events').insert({
      project_id: project.id,
      source_event_id: sourceEventId,
      event_type: 'portfolio.status_observed',
      severity: eventSeverity(envelope),
      screen: 'control-room.manifest.json',
      provider: 'github_oidc',
      decision: envelope.gate_status === 'pass' && envelope.status !== 'blocked'
        ? 'observe'
        : 'hold_promotion',
      metadata,
      created_at: envelope.observed_at,
    });
    if (eventError && !isUniqueViolation(eventError)) throw eventError;

    const reusableUntil = new Date(Date.parse(envelope.observed_at) + 24 * 60 * 60 * 1000).toISOString();
    const { error: evidenceError } = await supabase.from('evidence').insert({
      project_id: project.id,
      mission_id: null,
      subject: 'L99 sanitized portfolio status',
      kind: 'portfolio_status',
      status: evidenceStatus(envelope),
      provider: 'github_oidc',
      commit_sha: envelope.commit,
      environment: 'main',
      details_ref: 'control-room.manifest.json',
      reusable_until: reusableUntil,
      created_at: envelope.observed_at,
    });
    if (evidenceError && !isUniqueViolation(evidenceError)) throw evidenceError;

    const duplicate = isUniqueViolation(eventError) || isUniqueViolation(evidenceError);
    console.log(JSON.stringify({
      event: duplicate ? 'l99_status_duplicate' : 'l99_status_ingested',
      project_id: project.id,
      commit: envelope.commit,
      gate_status: envelope.gate_status,
    }));

    return json(duplicate ? 200 : 202, {
      ok: true,
      duplicate,
      source_event_id: sourceEventId,
      commit: envelope.commit,
      gate_status: envelope.gate_status,
      authority: 'sanitized-read-only-observer',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    const unauthorized = message.startsWith('oidc_') || message === 'missing_bearer_token';
    const invalidPayload = message.startsWith('payload_') ||
      message.includes('_invalid') ||
      message.includes('_mismatch') ||
      message.includes('_must_be_') ||
      message.includes('_contains_sensitive_material') ||
      message.includes('_stale') ||
      message.includes('_in_future');
    console.error(JSON.stringify({ event: 'l99_status_rejected', reason: message }));
    return json(unauthorized ? 401 : invalidPayload ? 400 : 500, { error: message });
  }
});
