import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const TOOL_NAME = 'invoke_founder_signal_engine';
const ACTIVE_REPOSITORY = 'jussray/Sekret-Bip';
const ACTIVE_PROJECT_SLUG = 'sekret-bip';
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const INVOCATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SECRETISH_PATTERN = /(sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|hooks\.zapier\.com|API[_-]?KEY|SERVICE[_-]?ROLE|PASSWORD|SECRET|TOKEN)/i;
const ALLOWED_ACTIONS = new Set(['run_openai_step', 'queue_review_draft', 'publish_or_send']);
const ALLOWED_ARGUMENT_KEYS = new Set([
  'invocationId',
  'sourceRepository',
  'sourcePr',
  'sourceCommitSha',
  'requestedAction',
  'steeringGrantId',
  'auditPath',
  'rollbackStep',
  'requestingAgent',
  'allowHubSpotWrite',
  'founderApprovalId',
]);

type JsonRpcId = string | number | null;
type DbRecord = Record<string, unknown>;

type RequestedAction = 'run_openai_step' | 'queue_review_draft' | 'publish_or_send';

interface InvocationArguments {
  invocationId: string;
  sourceRepository: typeof ACTIVE_REPOSITORY;
  sourcePr: number;
  sourceCommitSha: string;
  requestedAction: RequestedAction;
  steeringGrantId: string;
  auditPath: string;
  rollbackStep: string;
  requestingAgent: string;
  allowHubSpotWrite: boolean;
  founderApprovalId: string | null;
}

interface JsonRpcRequestBody {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface AuditEvent {
  sourceEventId: string;
  eventType: string;
  severity: 'info' | 'warning' | 'error';
  decision: string;
  metadata: DbRecord;
}

export interface FounderSignalEngineMcpDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  resolveProjectId?: () => Promise<string>;
  writeAuditEvent?: (projectId: string, event: AuditEvent) => Promise<void>;
}

interface ProviderReceipt {
  accepted: boolean;
  httpStatus: number;
  runId: string | null;
  responseKind: 'json' | 'text' | 'empty';
  detail: string | null;
}

class DuplicateInvocationError extends Error {
  constructor() {
    super('Duplicate Founder Signal Engine invocation blocked');
  }
}

function isRecord(value: unknown): value is DbRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function rpcId(value: unknown): JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null ? value : null;
}

function rpcResult(id: JsonRpcId, result: unknown): DbRecord {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): DbRecord {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function containsSecretLikeMaterial(value: unknown): boolean {
  if (typeof value === 'string') return SECRETISH_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeMaterial);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => SECRETISH_PATTERN.test(key) || containsSecretLikeMaterial(nested));
}

function parseInvocationArguments(value: unknown): { value: InvocationArguments | null; errors: string[] } {
  if (!isRecord(value)) return { value: null, errors: ['arguments must be an object'] };

  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!ALLOWED_ARGUMENT_KEYS.has(key)) errors.push(`unexpected argument: ${key}`);
  }
  if (containsSecretLikeMaterial(value)) errors.push('arguments must not contain credentials, hook URLs, or secret-like material');

  const invocationId = nonEmptyString(value.invocationId, 64);
  if (!invocationId || !INVOCATION_ID_PATTERN.test(invocationId)) errors.push('invocationId must be a UUID');

  const sourceRepository = nonEmptyString(value.sourceRepository, 100);
  if (sourceRepository !== ACTIVE_REPOSITORY) errors.push(`sourceRepository must be ${ACTIVE_REPOSITORY}`);

  const sourcePr = Number(value.sourcePr);
  if (!Number.isInteger(sourcePr) || sourcePr <= 0) errors.push('sourcePr must be a positive integer');

  const sourceCommitSha = nonEmptyString(value.sourceCommitSha, 40);
  if (!sourceCommitSha || !COMMIT_SHA_PATTERN.test(sourceCommitSha)) errors.push('sourceCommitSha must be an exact 40-character commit SHA');

  const requestedAction = nonEmptyString(value.requestedAction, 50);
  if (!requestedAction || !ALLOWED_ACTIONS.has(requestedAction)) errors.push('requestedAction is not allowed');

  const steeringGrantId = nonEmptyString(value.steeringGrantId, 200);
  if (!steeringGrantId) errors.push('steeringGrantId is required');

  const auditPath = nonEmptyString(value.auditPath, 500);
  if (!auditPath) errors.push('auditPath is required');

  const rollbackStep = nonEmptyString(value.rollbackStep, 500);
  if (!rollbackStep) errors.push('rollbackStep is required');

  const requestingAgent = nonEmptyString(value.requestingAgent, 100);
  if (!requestingAgent) errors.push('requestingAgent is required');

  if (typeof value.allowHubSpotWrite !== 'boolean') errors.push('allowHubSpotWrite must be a boolean');
  const allowHubSpotWrite = value.allowHubSpotWrite === true;

  const founderApprovalId = value.founderApprovalId === undefined || value.founderApprovalId === null
    ? null
    : nonEmptyString(value.founderApprovalId, 200);
  if (value.founderApprovalId !== undefined && value.founderApprovalId !== null && !founderApprovalId) {
    errors.push('founderApprovalId must be a non-empty string when provided');
  }

  if ((requestedAction === 'publish_or_send' || allowHubSpotWrite) && !founderApprovalId) {
    errors.push('founderApprovalId is required for publication, sending, or HubSpot mutation');
  }

  if (errors.length > 0 || !invocationId || sourceRepository !== ACTIVE_REPOSITORY || !sourceCommitSha || !requestedAction || !steeringGrantId || !auditPath || !rollbackStep || !requestingAgent) {
    return { value: null, errors };
  }

  return {
    value: {
      invocationId,
      sourceRepository: ACTIVE_REPOSITORY,
      sourcePr,
      sourceCommitSha,
      requestedAction: requestedAction as RequestedAction,
      steeringGrantId,
      auditPath,
      rollbackStep,
      requestingAgent,
      allowHubSpotWrite,
      founderApprovalId,
    },
    errors: [],
  };
}

function toolDefinition(): DbRecord {
  return {
    name: TOOL_NAME,
    title: 'Invoke Founder Signal Engine',
    description: 'Use this when ChatGPT or another approved agent needs to invoke the scoped Founder Signal Engine Zapier bridge for verified GitHub evidence. This tool does not expose credentials and does not prove the downstream chain without a Zapier run ID.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'invocationId',
        'sourceRepository',
        'sourcePr',
        'sourceCommitSha',
        'requestedAction',
        'steeringGrantId',
        'auditPath',
        'rollbackStep',
        'requestingAgent',
        'allowHubSpotWrite',
      ],
      properties: {
        invocationId: { type: 'string', format: 'uuid', description: 'Caller-generated idempotency identifier.' },
        sourceRepository: { type: 'string', enum: [ACTIVE_REPOSITORY] },
        sourcePr: { type: 'integer', minimum: 1 },
        sourceCommitSha: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
        requestedAction: { type: 'string', enum: [...ALLOWED_ACTIONS] },
        steeringGrantId: { type: 'string', minLength: 1, maxLength: 200 },
        auditPath: { type: 'string', minLength: 1, maxLength: 500 },
        rollbackStep: { type: 'string', minLength: 1, maxLength: 500 },
        requestingAgent: { type: 'string', minLength: 1, maxLength: 100 },
        allowHubSpotWrite: { type: 'boolean' },
        founderApprovalId: { type: ['string', 'null'], minLength: 1, maxLength: 200 },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  };
}

async function defaultResolveProjectId(): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', ACTIVE_PROJECT_SLUG)
    .maybeSingle();
  if (error) throw new Error(`PROJECT_LOOKUP_FAILED:${error.message}`);
  const id = isRecord(data) ? nonEmptyString(data.id, 100) : null;
  if (!id) throw new Error(`PROJECT_NOT_REGISTERED:${ACTIVE_PROJECT_SLUG}`);
  return id;
}

async function defaultWriteAuditEvent(projectId: string, event: AuditEvent): Promise<void> {
  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: event.sourceEventId,
    event_type: event.eventType,
    severity: event.severity,
    screen: 'founder-signal-engine-remote-mcp',
    provider: 'zapier',
    decision: event.decision,
    metadata: event.metadata,
  });
  if (!error) return;
  if ((error as { code?: string }).code === '23505') throw new DuplicateInvocationError();
  throw new Error(`AUDIT_WRITE_FAILED:${error.message}`);
}

function hookUrl(env: NodeJS.ProcessEnv): URL {
  const raw = env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL?.trim();
  if (!raw) throw new Error('ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL is not configured');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Zapier hook URL must use http or https');
  if (env.NODE_ENV === 'production') {
    if (url.protocol !== 'https:' || url.hostname !== 'hooks.zapier.com') {
      throw new Error('Production Zapier hook URL must use https://hooks.zapier.com');
    }
  }
  return url;
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const configured = Number(env.FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured < 500 || configured > 60_000) return DEFAULT_TIMEOUT_MS;
  return configured;
}

async function readProviderResponse(response: Response): Promise<{ kind: ProviderReceipt['responseKind']; payload: unknown; detail: string | null }> {
  if (!response.body) return { kind: 'empty', payload: null, detail: null };
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    await response.body.cancel();
    throw new Error('Zapier response exceeded the allowed size');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Zapier response exceeded the allowed size');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty', payload: null, detail: null };
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return { kind: 'json', payload: JSON.parse(trimmed), detail: null };
    } catch {
      return { kind: 'text', payload: null, detail: 'Zapier returned invalid JSON' };
    }
  }
  return { kind: 'text', payload: null, detail: trimmed.slice(0, 500) };
}

function explicitRunId(payload: unknown, response: Response): string | null {
  const headerRunId = nonEmptyString(response.headers.get('x-zapier-run-id'), 200);
  if (headerRunId) return headerRunId;
  if (!isRecord(payload)) return null;
  const candidates = [payload.zapier_run_id, payload.zapierRunId, payload.run_id, payload.runId];
  const data = isRecord(payload.data) ? payload.data : null;
  if (data) candidates.push(data.zapier_run_id, data.zapierRunId, data.run_id, data.runId);
  for (const candidate of candidates) {
    const runId = nonEmptyString(candidate, 200);
    if (runId) return runId;
  }
  return null;
}

async function callZapier(
  args: InvocationArguments,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<ProviderReceipt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const response = await fetchFn(hookUrl(env), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-founder-signal-invocation-id': args.invocationId,
      },
      body: JSON.stringify({
        event: 'founder_signal_engine_mcp_invocation',
        invocation_id: args.invocationId,
        source_repository: args.sourceRepository,
        source_pr: args.sourcePr,
        source_commit_sha: args.sourceCommitSha,
        requested_action: args.requestedAction,
        steering_grant_id: args.steeringGrantId,
        audit_path: args.auditPath,
        rollback_step: args.rollbackStep,
        requesting_agent: args.requestingAgent,
        allow_hubspot_write: args.allowHubSpotWrite,
        founder_approval_id: args.founderApprovalId,
        key_reference: 'zapier-founder-signal-engine',
      }),
      signal: controller.signal,
    });
    const parsed = await readProviderResponse(response);
    return {
      accepted: response.ok,
      httpStatus: response.status,
      runId: explicitRunId(parsed.payload, response),
      responseKind: parsed.kind,
      detail: parsed.detail,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Zapier hook request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toolResponse(receipt: DbRecord, isError: boolean): DbRecord {
  const text = isError
    ? `Founder Signal Engine invocation failed or remains blocked. Invocation ${String(receipt.invocationId ?? 'unknown')}.`
    : `Founder Signal Engine bridge accepted invocation ${String(receipt.invocationId)}. ${receipt.zapierRunId ? `Zapier run ${String(receipt.zapierRunId)} was returned.` : 'Zapier did not return a run ID, so end-to-end proof is still incomplete.'}`;
  return {
    content: [{ type: 'text', text }],
    structuredContent: receipt,
    isError,
  };
}

async function invokeTool(
  args: InvocationArguments,
  dependencies: Required<FounderSignalEngineMcpDependencies>,
): Promise<DbRecord> {
  const projectId = await dependencies.resolveProjectId();
  const requestEventId = `fse-mcp:${args.invocationId}:requested`;
  const resultEventId = `fse-mcp:${args.invocationId}:result`;

  try {
    await dependencies.writeAuditEvent(projectId, {
      sourceEventId: requestEventId,
      eventType: 'founder_signal_engine_bridge_requested',
      severity: 'warning',
      decision: 'requested',
      metadata: {
        invocationId: args.invocationId,
        sourceRepository: args.sourceRepository,
        sourcePr: args.sourcePr,
        sourceCommitSha: args.sourceCommitSha,
        requestedAction: args.requestedAction,
        steeringGrantId: args.steeringGrantId,
        auditPath: args.auditPath,
        rollbackStep: args.rollbackStep,
        requestingAgent: args.requestingAgent,
        allowHubSpotWrite: args.allowHubSpotWrite,
        founderApprovalPresent: Boolean(args.founderApprovalId),
      },
    });
  } catch (error) {
    if (error instanceof DuplicateInvocationError) {
      return toolResponse({
        invocationId: args.invocationId,
        accepted: false,
        auditComplete: true,
        duplicateBlocked: true,
        endToEndProofComplete: false,
        nextGate: 'Use a new invocationId only after inspecting the prior invocation evidence.',
      }, true);
    }
    throw error;
  }

  let providerReceipt: ProviderReceipt;
  try {
    providerReceipt = await callZapier(args, dependencies.env, dependencies.fetchFn);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Zapier bridge failure';
    await dependencies.writeAuditEvent(projectId, {
      sourceEventId: resultEventId,
      eventType: 'founder_signal_engine_bridge_failed',
      severity: 'error',
      decision: 'failed',
      metadata: {
        invocationId: args.invocationId,
        sourceCommitSha: args.sourceCommitSha,
        requestedAction: args.requestedAction,
        failure: message,
      },
    });
    return toolResponse({
      invocationId: args.invocationId,
      accepted: false,
      auditComplete: true,
      providerError: message,
      zapierRunId: null,
      endToEndProofComplete: false,
      nextGate: 'Repair the configured Zapier Catch Hook or network path, then invoke with a new invocationId.',
    }, true);
  }

  const proofComplete = providerReceipt.accepted && Boolean(providerReceipt.runId);
  try {
    await dependencies.writeAuditEvent(projectId, {
      sourceEventId: resultEventId,
      eventType: providerReceipt.accepted
        ? 'founder_signal_engine_bridge_accepted'
        : 'founder_signal_engine_bridge_rejected',
      severity: providerReceipt.accepted ? 'info' : 'error',
      decision: providerReceipt.accepted ? 'accepted' : 'rejected',
      metadata: {
        invocationId: args.invocationId,
        sourceCommitSha: args.sourceCommitSha,
        requestedAction: args.requestedAction,
        providerHttpStatus: providerReceipt.httpStatus,
        providerResponseKind: providerReceipt.responseKind,
        zapierRunId: providerReceipt.runId,
        endToEndProofComplete: proofComplete,
      },
    });
  } catch (error) {
    return toolResponse({
      invocationId: args.invocationId,
      accepted: providerReceipt.accepted,
      providerHttpStatus: providerReceipt.httpStatus,
      zapierRunId: providerReceipt.runId,
      auditComplete: false,
      endToEndProofComplete: false,
      auditError: error instanceof Error ? error.message : 'Unknown post-call audit failure',
      nextGate: 'The provider call occurred, but Founder Control Room could not retain the result audit. Repair audit storage before retrying.',
    }, true);
  }

  return toolResponse({
    invocationId: args.invocationId,
    accepted: providerReceipt.accepted,
    providerHttpStatus: providerReceipt.httpStatus,
    providerResponseKind: providerReceipt.responseKind,
    providerDetail: providerReceipt.detail,
    zapierRunId: providerReceipt.runId,
    auditComplete: true,
    endToEndProofComplete: proofComplete,
    sourceRepository: args.sourceRepository,
    sourcePr: args.sourcePr,
    sourceCommitSha: args.sourceCommitSha,
    requestedAction: args.requestedAction,
    nextGate: proofComplete
      ? 'Capture the OpenAI 5W1H result, Buffer artifact, HubSpot association, and Founder Control Room evidence.'
      : 'Locate the invocation in Zapier history using invocationId, record its run ID, and continue downstream evidence capture.',
  }, !providerReceipt.accepted);
}

function requiredDependencies(overrides: FounderSignalEngineMcpDependencies): Required<FounderSignalEngineMcpDependencies> {
  return {
    env: overrides.env ?? process.env,
    fetchFn: overrides.fetchFn ?? fetch,
    resolveProjectId: overrides.resolveProjectId ?? defaultResolveProjectId,
    writeAuditEvent: overrides.writeAuditEvent ?? defaultWriteAuditEvent,
  };
}

export function createFounderSignalEngineMcpHandler(
  overrides: FounderSignalEngineMcpDependencies = {},
): RequestHandler {
  const dependencies = requiredDependencies(overrides);

  return async (req: Request, res: Response) => {
    const configuredToken = dependencies.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN?.trim();
    if (!configuredToken) return res.status(503).json(rpcError(null, -32001, 'Founder Signal Engine MCP token is not configured'));
    const token = bearerToken(req);
    if (!token || !secureEqual(token, configuredToken)) return res.status(401).json(rpcError(null, -32000, 'Unauthorized'));

    const body = req.body as JsonRpcRequestBody;
    const id = rpcId(body?.id);
    if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return res.status(400).json(rpcError(id, -32600, 'Invalid JSON-RPC request'));
    }

    if (body.method === 'notifications/initialized') return res.status(204).send();
    if (body.method === 'initialize') {
      return res.json(rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'founder-signal-engine-bridge', version: '1.0.0' },
      }));
    }
    if (body.method === 'ping') return res.json(rpcResult(id, {}));
    if (body.method === 'tools/list') return res.json(rpcResult(id, { tools: [toolDefinition()] }));
    if (body.method !== 'tools/call') return res.status(404).json(rpcError(id, -32601, `Method not found: ${body.method}`));

    const params = isRecord(body.params) ? body.params : null;
    if (!params || params.name !== TOOL_NAME) {
      return res.status(400).json(rpcError(id, -32602, `Only ${TOOL_NAME} is available`));
    }

    const parsed = parseInvocationArguments(params.arguments);
    if (!parsed.value) return res.status(400).json(rpcError(id, -32602, 'Invalid tool arguments', parsed.errors));

    try {
      const result = await invokeTool(parsed.value, dependencies);
      return res.json(rpcResult(id, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Founder Signal Engine MCP failure';
      return res.status(500).json(rpcError(id, -32603, message));
    }
  };
}

export const handleFounderSignalEngineMcp = createFounderSignalEngineMcpHandler();
