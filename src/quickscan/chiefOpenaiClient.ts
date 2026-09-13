import type { ChiefQuickScanRecommendation } from './contracts.js';
import {
  QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
  QUICKSCAN_CHIEF_PROMPT_VERSION,
  QUICKSCAN_CHIEF_SYSTEM_PROMPT,
  QUICKSCAN_CHIEF_WORKFLOW,
  quickScanChiefUserPrompt,
  type QuickScanChiefPromptInput,
} from './chiefPrompts.js';
import {
  selectFreeFirstCapability,
  traceCapabilityDecision,
  type CapabilityCandidate,
  type CapabilityDecisionTrace,
  type CapabilityRequirements,
  type CapabilitySelectionReceipt,
} from '../capabilities/freeFirstCapabilityPolicy.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

interface JsonRecord {
  [key: string]: unknown;
}

export type QuickScanChiefProvider = 'local-ollama' | 'openai';

export interface QuickScanChiefProvenance {
  provider: QuickScanChiefProvider;
  model: string;
  responseId: string | null;
  promptVersion: string;
  selection: CapabilitySelectionReceipt;
  decisionTrace: CapabilityDecisionTrace[];
  fallbackReason: string | null;
}

export interface QuickScanChiefResult {
  recommendation: ChiefQuickScanRecommendation;
  provenance: QuickScanChiefProvenance;
}

export interface OpenAiQuickScanChiefDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
}

export class QuickScanChiefProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'QuickScanChiefProviderError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new QuickScanChiefProviderError(`Model output field ${field} must be a string`, 'INVALID_MODEL_OUTPUT');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new QuickScanChiefProviderError(`Model output field ${field} is outside its allowed length`, 'INVALID_MODEL_OUTPUT');
  }
  return trimmed;
}

const NEXT_ACTIONS = new Set([
  'capture_more_evidence',
  'approve_outreach',
  'offer_fit_check',
  'send_payment_link',
  'prepare_delivery',
  'disqualify',
]);

const MESSAGE_REQUIRED_ACTIONS = new Set(['approve_outreach', 'send_payment_link', 'prepare_delivery']);

function nextAction(value: unknown): ChiefQuickScanRecommendation['nextAction'] {
  const action = stringValue(value, 'next_action', 40);
  if (!NEXT_ACTIONS.has(action)) {
    throw new QuickScanChiefProviderError('Model output next_action is unsupported', 'INVALID_MODEL_OUTPUT');
  }
  return action as ChiefQuickScanRecommendation['nextAction'];
}

function modelOutput(value: unknown): ChiefQuickScanRecommendation {
  if (!isRecord(value)) {
    throw new QuickScanChiefProviderError('Model output must be an object', 'INVALID_MODEL_OUTPUT');
  }

  const summary = stringValue(value.summary, 'summary', 600);
  const action = nextAction(value.next_action);

  let messageDraft: string | undefined;
  if (value.message_draft === null || value.message_draft === undefined) {
    messageDraft = undefined;
  } else {
    messageDraft = stringValue(value.message_draft, 'message_draft', 1_000);
  }

  if (MESSAGE_REQUIRED_ACTIONS.has(action) && !messageDraft) {
    throw new QuickScanChiefProviderError(`Model output next_action=${action} requires a non-null message_draft`, 'INVALID_MODEL_OUTPUT');
  }

  return {
    summary,
    nextAction: action,
    messageDraft,
    promptWorkflow: QUICKSCAN_CHIEF_WORKFLOW,
  };
}

function responseText(payload: JsonRecord): string | null {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return null;

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return null;
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.QUICKSCAN_CHIEF_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function baseUrl(env: NodeJS.ProcessEnv): string {
  return (env.OPENAI_API_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
}

function localBaseUrl(env: NodeJS.ProcessEnv): string {
  return (env.QUICKSCAN_LOCAL_BASE_URL?.trim() || '').replace(/\/$/, '');
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function localCandidate(env: NodeJS.ProcessEnv): CapabilityCandidate {
  const configured = Boolean(localBaseUrl(env) && env.QUICKSCAN_LOCAL_MODEL?.trim());
  return {
    id: 'local-ollama',
    costClass: 'LOCAL_NO_PROVIDER_FEE',
    safetyEligible: enabled(env.QUICKSCAN_LOCAL_ENABLED),
    privacyEligible: true,
    commercialRights: env.QUICKSCAN_LOCAL_COMMERCIAL_RIGHTS?.trim().toLowerCase() === 'verified' ? 'VERIFIED' : 'UNKNOWN',
    quotaAvailable: configured,
    automationEligible: true,
    licenseEvidence: env.QUICKSCAN_LOCAL_LICENSE_EVIDENCE?.trim() || null,
    quotaEvidence: configured ? 'local-runtime-configured' : null,
    eligibilityRevision: env.QUICKSCAN_LOCAL_ELIGIBILITY_REVISION?.trim() || 'quickscan-local-v1',
    transportReady: configured,
    transportEvidence: configured ? `configured:${localBaseUrl(env)}` : null,
  };
}

function openAiCandidate(env: NodeJS.ProcessEnv): CapabilityCandidate {
  const configured = Boolean(env.OPENAI_API_KEY?.trim());
  return {
    id: 'openai',
    costClass: 'PAID',
    safetyEligible: true,
    privacyEligible: true,
    commercialRights: 'VERIFIED',
    quotaAvailable: configured,
    automationEligible: true,
    licenseEvidence: 'provider-api-terms',
    quotaEvidence: configured ? 'api-key-configured' : null,
    eligibilityRevision: env.QUICKSCAN_OPENAI_ELIGIBILITY_REVISION?.trim() || 'quickscan-openai-v1',
    transportReady: configured,
    transportEvidence: configured ? `configured:${baseUrl(env)}` : null,
  };
}

function qualityRequirements(env: NodeJS.ProcessEnv): CapabilityRequirements {
  return {
    commercialUseRequired: true,
    automationRequired: true,
    minimumQualityMet: (candidate) => candidate.id === 'local-ollama'
      ? enabled(env.QUICKSCAN_LOCAL_QUALITY_VERIFIED)
      : true,
  };
}

function providerCandidates(env: NodeJS.ProcessEnv): CapabilityCandidate[] {
  return [localCandidate(env), openAiCandidate(env)];
}

async function readBoundedResponse(response: Response, providerLabel: string): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new QuickScanChiefProviderError(`${providerLabel} response exceeded the allowed size`, 'CHIEF_RESPONSE_TOO_LARGE', response.status);
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new QuickScanChiefProviderError(`${providerLabel} response exceeded the allowed size`, 'CHIEF_RESPONSE_TOO_LARGE', response.status);
  }
  return raw;
}

async function runOpenAi(
  input: QuickScanChiefPromptInput,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<Omit<QuickScanChiefResult, 'provenance'> & { provider: 'openai'; model: string; responseId: string | null }> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new QuickScanChiefProviderError('OPENAI_API_KEY is not configured for QuickScan Chief', 'OPENAI_NOT_CONFIGURED');
  }

  const model = env.QUICKSCAN_CHIEF_MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));

  let response: Response;
  let raw: string;
  try {
    response = await fetchFn(`${baseUrl(env)}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 800,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: QUICKSCAN_CHIEF_SYSTEM_PROMPT }] },
          { role: 'user', content: [{ type: 'input_text', text: quickScanChiefUserPrompt(input) }] },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'quickscan_chief_output',
            strict: true,
            schema: QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });
    raw = await readBoundedResponse(response, 'OpenAI');
  } catch (error) {
    if (error instanceof QuickScanChiefProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new QuickScanChiefProviderError('OpenAI QuickScan Chief request timed out', 'OPENAI_TIMEOUT');
    }
    throw new QuickScanChiefProviderError(
      error instanceof Error ? error.message : 'OpenAI QuickScan Chief request failed',
      'OPENAI_REQUEST_FAILED',
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new QuickScanChiefProviderError('OpenAI returned invalid JSON', 'OPENAI_INVALID_RESPONSE', response.status);
  }

  if (!response.ok) {
    const errorRecord = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const providerMessage = errorRecord && typeof errorRecord.message === 'string'
      ? errorRecord.message
      : `OpenAI request failed with status ${response.status}`;
    throw new QuickScanChiefProviderError(providerMessage, 'OPENAI_HTTP_ERROR', response.status);
  }
  if (!isRecord(payload)) {
    throw new QuickScanChiefProviderError('OpenAI response body was empty or malformed', 'OPENAI_INVALID_RESPONSE', response.status);
  }

  const outputText = responseText(payload);
  if (!outputText) {
    throw new QuickScanChiefProviderError('OpenAI response did not contain structured output text', 'OPENAI_MISSING_OUTPUT', response.status);
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new QuickScanChiefProviderError('OpenAI structured output was not valid JSON', 'OPENAI_INVALID_OUTPUT_JSON', response.status);
  }

  return {
    recommendation: modelOutput(parsedOutput),
    provider: 'openai',
    model,
    responseId: typeof payload.id === 'string' ? payload.id : null,
  };
}

async function runLocalOllama(
  input: QuickScanChiefPromptInput,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<Omit<QuickScanChiefResult, 'provenance'> & { provider: 'local-ollama'; model: string; responseId: string | null }> {
  const localUrl = localBaseUrl(env);
  const model = env.QUICKSCAN_LOCAL_MODEL?.trim();
  if (!localUrl || !model) {
    throw new QuickScanChiefProviderError('Local QuickScan Chief runtime is not configured', 'LOCAL_CHIEF_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  let response: Response;
  let raw: string;
  try {
    response = await fetchFn(`${localUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
        messages: [
          { role: 'system', content: QUICKSCAN_CHIEF_SYSTEM_PROMPT },
          { role: 'user', content: quickScanChiefUserPrompt(input) },
        ],
      }),
      signal: controller.signal,
    });
    raw = await readBoundedResponse(response, 'Local Chief');
  } catch (error) {
    if (error instanceof QuickScanChiefProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new QuickScanChiefProviderError('Local QuickScan Chief request timed out', 'LOCAL_CHIEF_TIMEOUT');
    }
    throw new QuickScanChiefProviderError(
      error instanceof Error ? error.message : 'Local QuickScan Chief request failed',
      'LOCAL_CHIEF_REQUEST_FAILED',
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new QuickScanChiefProviderError('Local QuickScan Chief returned invalid JSON', 'LOCAL_CHIEF_INVALID_RESPONSE', response.status);
  }
  if (!response.ok) {
    throw new QuickScanChiefProviderError(`Local QuickScan Chief failed with status ${response.status}`, 'LOCAL_CHIEF_HTTP_ERROR', response.status);
  }
  if (!isRecord(payload)) {
    throw new QuickScanChiefProviderError('Local QuickScan Chief response body was empty or malformed', 'LOCAL_CHIEF_INVALID_RESPONSE', response.status);
  }

  const message = isRecord(payload.message) ? payload.message : null;
  const content = message && typeof message.content === 'string'
    ? message.content
    : typeof payload.response === 'string'
      ? payload.response
      : null;
  if (!content?.trim()) {
    throw new QuickScanChiefProviderError('Local QuickScan Chief returned no structured content', 'LOCAL_CHIEF_MISSING_OUTPUT', response.status);
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(content);
  } catch {
    throw new QuickScanChiefProviderError('Local QuickScan Chief output was not valid JSON', 'LOCAL_CHIEF_INVALID_OUTPUT_JSON', response.status);
  }

  return {
    recommendation: modelOutput(parsedOutput),
    provider: 'local-ollama',
    model,
    responseId: typeof payload.created_at === 'string' ? payload.created_at : null,
  };
}

export function createOpenAiQuickScanChiefRunner(dependencies: OpenAiQuickScanChiefDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runQuickScanChief(input: QuickScanChiefPromptInput): Promise<QuickScanChiefResult> {
    const requirements = qualityRequirements(env);
    let candidates = providerCandidates(env);
    let decisionTrace = traceCapabilityDecision(candidates, requirements);
    let selection = selectFreeFirstCapability(candidates, requirements);

    if (!selection) {
      if (!env.OPENAI_API_KEY?.trim() && !localBaseUrl(env)) {
        throw new QuickScanChiefProviderError('No QuickScan Chief provider is configured', 'OPENAI_NOT_CONFIGURED');
      }
      throw new QuickScanChiefProviderError(
        `No eligible QuickScan Chief provider. ${decisionTrace.map((entry) => `${entry.providerId}:${entry.reasons.join(',') || 'eligible'}`).join('; ')}`,
        'CHIEF_PROVIDER_INELIGIBLE',
      );
    }

    let fallbackReason: string | null = null;

    if (selection.providerId === 'local-ollama') {
      try {
        const local = await runLocalOllama(input, env, fetchFn);
        return {
          recommendation: local.recommendation,
          provenance: {
            provider: local.provider,
            model: local.model,
            responseId: local.responseId,
            promptVersion: QUICKSCAN_CHIEF_PROMPT_VERSION,
            selection,
            decisionTrace,
            fallbackReason,
          },
        };
      } catch (error) {
        fallbackReason = error instanceof QuickScanChiefProviderError ? error.code : 'LOCAL_CHIEF_FAILED';
        candidates = candidates.map((candidate) => candidate.id === 'local-ollama'
          ? { ...candidate, transportReady: false, transportEvidence: `runtime-failure:${fallbackReason}` }
          : candidate);
        decisionTrace = traceCapabilityDecision(candidates, requirements);
        selection = selectFreeFirstCapability(candidates, requirements);
        if (!selection) throw error;
      }
    }

    const paid = await runOpenAi(input, env, fetchFn);
    return {
      recommendation: paid.recommendation,
      provenance: {
        provider: paid.provider,
        model: paid.model,
        responseId: paid.responseId,
        promptVersion: QUICKSCAN_CHIEF_PROMPT_VERSION,
        selection,
        decisionTrace,
        fallbackReason,
      },
    };
  };
}
