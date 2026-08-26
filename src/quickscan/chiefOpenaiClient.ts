import type { ChiefQuickScanRecommendation } from './contracts.js';
import {
  QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
  QUICKSCAN_CHIEF_PROMPT_VERSION,
  QUICKSCAN_CHIEF_SYSTEM_PROMPT,
  QUICKSCAN_CHIEF_WORKFLOW,
  quickScanChiefUserPrompt,
  type QuickScanChiefPromptInput,
} from './chiefPrompts.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

interface JsonRecord {
  [key: string]: unknown;
}

export interface QuickScanChiefProvenance {
  provider: 'openai';
  model: string;
  responseId: string | null;
  promptVersion: string;
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

export function createOpenAiQuickScanChiefRunner(dependencies: OpenAiQuickScanChiefDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runQuickScanChief(input: QuickScanChiefPromptInput): Promise<QuickScanChiefResult> {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new QuickScanChiefProviderError('OPENAI_API_KEY is not configured for QuickScan Chief', 'OPENAI_NOT_CONFIGURED');
    }

    const model = env.QUICKSCAN_CHIEF_MODEL?.trim() || DEFAULT_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));

    // The abort timer must stay armed through the full response body read,
    // not just the initial fetch() call: a provider or proxy that returns
    // headers promptly but then stalls mid-body would otherwise hang past
    // QUICKSCAN_CHIEF_TIMEOUT_MS once the timer was cleared too early.
    let response: globalThis.Response;
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
            {
              role: 'system',
              content: [{ type: 'input_text', text: QUICKSCAN_CHIEF_SYSTEM_PROMPT }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: quickScanChiefUserPrompt(input) }],
            },
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

      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new QuickScanChiefProviderError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
      }

      raw = await response.text();
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

    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new QuickScanChiefProviderError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
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
      provenance: {
        provider: 'openai',
        model,
        responseId: typeof payload.id === 'string' ? payload.id : null,
        promptVersion: QUICKSCAN_CHIEF_PROMPT_VERSION,
      },
    };
  };
}
