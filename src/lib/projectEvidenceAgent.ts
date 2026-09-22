import { providerForProject, type ProviderProjectConfig } from '../providers/providerFactory.js';
import type { RepositoryProvider, VerificationSignal } from '../providers/RepositoryProvider.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.6-sol';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TOOL_ROUNDS = 3;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EXACT_SHA = /^[0-9a-f]{40}$/i;
const PR_REF = /^(?:#|pr:)(\d+)$/i;

export const PROJECT_EVIDENCE_TYPES = [
  'repository',
  'pull_request',
  'ci',
  'deployment',
  'runtime',
  'playwright',
] as const;

export type ProjectEvidenceType = (typeof PROJECT_EVIDENCE_TYPES)[number];

export interface ProjectEvidenceRequest {
  repository: string;
  ref: string;
  evidence_types: ProjectEvidenceType[];
}

export interface ProjectEvidenceDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  providerFactory?: (project: ProviderProjectConfig) => RepositoryProvider;
}

interface JsonRecord {
  [key: string]: unknown;
}

interface ProjectEvidenceItem {
  type: ProjectEvidenceType;
  status: 'verified' | 'unknown' | 'blocked';
  source: string;
  data?: unknown;
  reason?: string;
}

export interface ProjectEvidenceReceipt {
  contract: 'juss/project-evidence-receipt@v1';
  repository: string;
  requestedRef: string;
  resolvedRef: string | null;
  exactSha: string | null;
  readOnly: true;
  authorityChanged: false;
  executionAuthorized: false;
  evidence: ProjectEvidenceItem[];
}

export interface ProjectEvidenceAuditInput {
  goal: string;
  repository: string;
  ref: string;
  environment: string;
}

export interface ProjectEvidenceAuditResult {
  contract: 'juss/project-evidence-agent@v1';
  provider: 'openai';
  model: string;
  responseId: string | null;
  storedByProvider: false;
  text: string;
  toolRounds: number;
}

export class ProjectEvidenceAgentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ProjectEvidenceAgentError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ProjectEvidenceAgentError(`${field} must be a string`, 'INVALID_TOOL_ARGUMENTS');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new ProjectEvidenceAgentError(`${field} is outside its allowed length`, 'INVALID_TOOL_ARGUMENTS');
  }
  return trimmed;
}

function evidenceTypes(value: unknown): ProjectEvidenceType[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PROJECT_EVIDENCE_TYPES.length) {
    throw new ProjectEvidenceAgentError('evidence_types must be a non-empty bounded array', 'INVALID_TOOL_ARGUMENTS');
  }
  const allowed = new Set<string>(PROJECT_EVIDENCE_TYPES);
  const parsed = value.map((item) => nonEmptyString(item, 'evidence_types', 32));
  if (parsed.some((item) => !allowed.has(item)) || new Set(parsed).size !== parsed.length) {
    throw new ProjectEvidenceAgentError('evidence_types contains unsupported or duplicate values', 'INVALID_TOOL_ARGUMENTS');
  }
  return parsed as ProjectEvidenceType[];
}

function parseEvidenceRequest(value: unknown): ProjectEvidenceRequest {
  if (!isRecord(value)) {
    throw new ProjectEvidenceAgentError('tool arguments must be an object', 'INVALID_TOOL_ARGUMENTS');
  }
  const repository = nonEmptyString(value.repository, 'repository', 200);
  if (!REPOSITORY_NAME.test(repository)) {
    throw new ProjectEvidenceAgentError('repository must use owner/name format', 'INVALID_TOOL_ARGUMENTS');
  }
  return {
    repository,
    ref: nonEmptyString(value.ref, 'ref', 200),
    evidence_types: evidenceTypes(value.evidence_types),
  };
}

function projectConfig(repository: string): ProviderProjectConfig {
  const slug = repository.split('/')[1]!.toLowerCase();
  return {
    repo_provider: 'github',
    slug,
    repo_identifier: repository,
  };
}

function signalSummary(signal: VerificationSignal) {
  return {
    id: signal.id,
    name: signal.name,
    status: signal.status,
    commitSha: signal.commitSha,
    evidenceFingerprint: signal.evidenceFingerprint ?? null,
    issuer: signal.issuer ?? null,
    startedAt: signal.startedAt ?? null,
    completedAt: signal.completedAt ?? null,
    detailsUrl: signal.detailsUrl ?? null,
  };
}

function matchingSignals(signals: VerificationSignal[], pattern: RegExp) {
  return signals.filter((signal) => pattern.test(signal.name)).map(signalSummary);
}

export async function getProjectEvidence(
  request: ProjectEvidenceRequest,
  dependencies: Pick<ProjectEvidenceDependencies, 'providerFactory'> = {},
): Promise<ProjectEvidenceReceipt> {
  const parsed = parseEvidenceRequest(request);
  const createProvider = dependencies.providerFactory ?? providerForProject;
  const config = projectConfig(parsed.repository);
  const provider = createProvider(config);
  const projectId = config.slug;
  const prMatch = PR_REF.exec(parsed.ref);

  let resolvedRef: string | null = null;
  let exactSha: string | null = null;
  let pullRequestContext: Awaited<ReturnType<NonNullable<RepositoryProvider['getPullRequestReviewContext']>>> | null = null;

  if (prMatch) {
    if (!provider.getPullRequestReviewContext) {
      throw new ProjectEvidenceAgentError('provider does not expose pull-request context', 'PULL_REQUEST_CONTEXT_UNAVAILABLE');
    }
    pullRequestContext = await provider.getPullRequestReviewContext(projectId, Number(prMatch[1]));
    resolvedRef = pullRequestContext.headRef;
    exactSha = pullRequestContext.headSha;
  } else {
    resolvedRef = parsed.ref;
    exactSha = EXACT_SHA.test(parsed.ref) ? parsed.ref.toLowerCase() : await provider.resolveRef(projectId, parsed.ref);
  }

  let verificationSignals: VerificationSignal[] | null = null;
  async function signals(): Promise<VerificationSignal[]> {
    verificationSignals ??= await provider.listVerificationSignals(projectId, exactSha!);
    return verificationSignals;
  }

  const evidence: ProjectEvidenceItem[] = [];
  for (const type of parsed.evidence_types) {
    if (type === 'repository') {
      const ref = await provider.getRef(projectId, exactSha!);
      evidence.push({
        type,
        status: 'verified',
        source: provider.name,
        data: {
          repository: parsed.repository,
          requestedRef: parsed.ref,
          resolvedRef,
          exactSha,
          committedAt: ref.committedAt ?? null,
        },
      });
      continue;
    }

    if (type === 'pull_request') {
      if (pullRequestContext) {
        evidence.push({ type, status: 'verified', source: provider.name, data: pullRequestContext });
      } else {
        evidence.push({
          type,
          status: 'unknown',
          source: provider.name,
          reason: 'A branch or commit ref does not identify one pull request. Use #<number> or pr:<number> to bind PR evidence.',
        });
      }
      continue;
    }

    if (type === 'ci') {
      evidence.push({ type, status: 'verified', source: provider.name, data: (await signals()).map(signalSummary) });
      continue;
    }

    if (type === 'playwright') {
      const matches = matchingSignals(await signals(), /playwright|browser|e2e/i);
      evidence.push({
        type,
        status: matches.length > 0 ? 'verified' : 'unknown',
        source: provider.name,
        data: matches,
        ...(matches.length === 0 ? { reason: 'No Playwright/browser verification signal was attached to the exact commit.' } : {}),
      });
      continue;
    }

    if (type === 'deployment') {
      const matches = matchingSignals(await signals(), /deploy|release|production|proof[ -]?of[ -]?ship|smoke/i);
      evidence.push({
        type,
        status: matches.length > 0 ? 'verified' : 'unknown',
        source: provider.name,
        data: {
          verificationSignals: matches,
          providerDeploymentValidated: false,
        },
        reason: matches.length > 0
          ? 'Repository verification signals are source-bound evidence only; they do not independently prove provider deployment state.'
          : 'No deployment-shaped verification signal was attached to the exact commit.',
      });
      continue;
    }

    evidence.push({
      type,
      status: 'unknown',
      source: 'fcr-runtime',
      reason: 'No canonical runtime readback adapter is wired into this evidence tool yet; do not infer runtime success from repository state.',
    });
  }

  return {
    contract: 'juss/project-evidence-receipt@v1',
    repository: parsed.repository,
    requestedRef: parsed.ref,
    resolvedRef,
    exactSha,
    readOnly: true,
    authorityChanged: false,
    executionAuthorized: false,
    evidence,
  };
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.FCR_EVIDENCE_AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function baseUrl(env: NodeJS.ProcessEnv): string {
  return (env.OPENAI_API_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
}

function responseText(payload: JsonRecord): string | null {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return null;
  const chunks: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content) || content.type !== 'output_text' || typeof content.text !== 'string') continue;
      if (content.text.trim()) chunks.push(content.text.trim());
    }
  }
  return chunks.length > 0 ? chunks.join('\n') : null;
}

async function readJsonResponse(response: globalThis.Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ProjectEvidenceAgentError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ProjectEvidenceAgentError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
  }
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new ProjectEvidenceAgentError('OpenAI returned invalid JSON', 'OPENAI_INVALID_RESPONSE', response.status);
  }
  if (!isRecord(payload)) {
    throw new ProjectEvidenceAgentError('OpenAI response body was empty or malformed', 'OPENAI_INVALID_RESPONSE', response.status);
  }
  if (!response.ok) {
    const errorRecord = isRecord(payload.error) ? payload.error : null;
    const message = errorRecord && typeof errorRecord.message === 'string'
      ? errorRecord.message
      : `OpenAI request failed with status ${response.status}`;
    throw new ProjectEvidenceAgentError(message, 'OPENAI_HTTP_ERROR', response.status);
  }
  return payload;
}

const SYSTEM_INSTRUCTIONS = `You are an evidence-first execution agent for software, infrastructure, deployment, and launch work.

Inspect authoritative evidence before making claims. Separate VERIFIED, INFERRED, UNKNOWN, and BLOCKED. Prefer one root cause, the smallest reversible repair, and current exact-subject proof. Capability is not approval. Evidence is not authority. A successful diagnostic is not a successful deployment.

When a bounded non-mutating diagnostic already exists, prove and use that diagnostic before recommending mutation of credentials, provider configuration, production state, databases, DNS, or secrets. If its proof gate is blocked by unrelated repository-wide checks, identify those dependencies instead of widening the change.

Distinguish token shape -> provider acceptance -> account/scope authorization -> deployment success -> product/runtime success. Passing one layer never proves the next. Never blindly rewrite credentials.

For user-facing applications, do not call work complete without real-browser evidence against the intended runtime when such verification is available. Old green does not become current green after base/head movement.

Return exactly: REALITY, FIX, PROOF, RISK, ROLLBACK, NEXT GATE. Say "I don't know" when evidence is unavailable.`;

const PROJECT_EVIDENCE_TOOL = {
  type: 'function',
  name: 'get_project_evidence',
  description: 'Retrieve read-only evidence about an authorized software project. Never merge, deploy, mutate secrets, modify provider configuration, or change repository state.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository in owner/name format, for example jussray/founder-control-room.',
      },
      ref: {
        type: 'string',
        description: 'Branch name, exact commit SHA, or pull request reference such as #860 or pr:860.',
      },
      evidence_types: {
        type: 'array',
        description: 'Read-only evidence categories to retrieve.',
        items: { type: 'string', enum: [...PROJECT_EVIDENCE_TYPES] },
      },
    },
    required: ['repository', 'ref', 'evidence_types'],
    additionalProperties: false,
  },
} as const;

export function createProjectEvidenceAgent(dependencies: ProjectEvidenceDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runProjectEvidenceAudit(input: ProjectEvidenceAuditInput): Promise<ProjectEvidenceAuditResult> {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ProjectEvidenceAgentError('OPENAI_API_KEY is not configured for project evidence audits', 'OPENAI_NOT_CONFIGURED');
    }

    const goal = nonEmptyString(input.goal, 'goal', 4_000);
    const repository = nonEmptyString(input.repository, 'repository', 200);
    if (!REPOSITORY_NAME.test(repository)) {
      throw new ProjectEvidenceAgentError('repository must use owner/name format', 'INVALID_AUDIT_INPUT');
    }
    const ref = nonEmptyString(input.ref, 'ref', 200);
    const environment = nonEmptyString(input.environment, 'environment', 500);
    const model = env.FCR_EVIDENCE_AGENT_MODEL?.trim() || DEFAULT_MODEL;

    const conversationInput: unknown[] = [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `Goal: ${goal}\n\nRepository: ${repository}\nTarget ref: ${ref}\nTarget environment: ${environment}\n\nAudit the project against the goal. Retrieve current evidence before making claims. Prefer existing focused repairs over duplicate work. Do not treat stale checks, skipped jobs, shape-only diagnostics, or historical evidence as current proof.`,
      }],
    }];

    let lastResponseId: string | null = null;
    for (let toolRounds = 0; toolRounds <= MAX_TOOL_ROUNDS; toolRounds += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs(env));
      let response: globalThis.Response;
      try {
        response = await fetchFn(`${baseUrl(env)}/responses`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            instructions: SYSTEM_INSTRUCTIONS,
            input: conversationInput,
            tools: [PROJECT_EVIDENCE_TOOL],
            tool_choice: 'auto',
            parallel_tool_calls: false,
            include: ['reasoning.encrypted_content'],
            reasoning: { effort: 'high' },
            text: { verbosity: 'medium' },
            store: false,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ProjectEvidenceAgentError('OpenAI project evidence audit timed out', 'OPENAI_TIMEOUT');
        }
        throw new ProjectEvidenceAgentError(
          error instanceof Error ? error.message : 'OpenAI project evidence audit failed',
          'OPENAI_REQUEST_FAILED',
        );
      } finally {
        clearTimeout(timer);
      }

      const payload = await readJsonResponse(response);
      lastResponseId = typeof payload.id === 'string' ? payload.id : lastResponseId;
      const output = Array.isArray(payload.output) ? payload.output : [];
      const calls = output.filter((item): item is JsonRecord => isRecord(item) && item.type === 'function_call');

      conversationInput.push(...output);

      if (calls.length === 0) {
        const text = responseText(payload);
        if (!text) {
          throw new ProjectEvidenceAgentError('OpenAI response did not contain audit text', 'OPENAI_MISSING_OUTPUT', response.status);
        }
        return {
          contract: 'juss/project-evidence-agent@v1',
          provider: 'openai',
          model,
          responseId: lastResponseId,
          storedByProvider: false,
          text,
          toolRounds,
        };
      }

      if (toolRounds >= MAX_TOOL_ROUNDS) {
        throw new ProjectEvidenceAgentError('OpenAI exceeded the bounded project-evidence tool loop', 'OPENAI_TOOL_LOOP_EXCEEDED');
      }

      for (const call of calls) {
        if (call.name !== 'get_project_evidence' || typeof call.call_id !== 'string' || typeof call.arguments !== 'string') {
          throw new ProjectEvidenceAgentError('OpenAI requested an unsupported tool call', 'UNSUPPORTED_TOOL_CALL');
        }
        let argumentsValue: unknown;
        try {
          argumentsValue = JSON.parse(call.arguments);
        } catch {
          throw new ProjectEvidenceAgentError('OpenAI tool arguments were invalid JSON', 'INVALID_TOOL_ARGUMENTS');
        }
        const request = parseEvidenceRequest(argumentsValue);
        const receipt = await getProjectEvidence(request, { providerFactory: dependencies.providerFactory });
        conversationInput.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(receipt),
        });
      }
    }

    throw new ProjectEvidenceAgentError('OpenAI project evidence audit ended unexpectedly', 'OPENAI_UNEXPECTED_END');
  };
}

export const runProjectEvidenceAudit = createProjectEvidenceAgent();
