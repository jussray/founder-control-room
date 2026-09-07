import {
  runStructuredJson,
  StructuredProviderError,
  type StructuredJsonResult,
  type StructuredProviderConfig,
  type StructuredProviderName,
} from '../aiRuntime/structuredProvider.js';
import type { ChiefQuickScanRecommendation } from './contracts.js';
import {
  QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
  QUICKSCAN_CHIEF_PROMPT_VERSION,
  QUICKSCAN_CHIEF_SYSTEM_PROMPT,
  QUICKSCAN_CHIEF_WORKFLOW,
  quickScanChiefUserPrompt,
  type QuickScanChiefPromptInput,
} from './chiefPrompts.js';

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

interface JsonRecord {
  [key: string]: unknown;
}

export interface QuickScanChiefProvenance {
  provider: 'openai' | 'anthropic';
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

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.QUICKSCAN_CHIEF_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function providerName(value: string | undefined, fallback: StructuredProviderName): StructuredProviderName {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'openai' || normalized === 'anthropic') return normalized;
  throw new QuickScanChiefProviderError(`Unsupported QuickScan Chief provider: ${normalized}`, 'MODEL_PROVIDER_INVALID');
}

function providerConfig(
  env: NodeJS.ProcessEnv,
  provider: StructuredProviderName,
  required: boolean,
): StructuredProviderConfig | null {
  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      if (required) {
        throw new QuickScanChiefProviderError('OPENAI_API_KEY is not configured for QuickScan Chief', 'OPENAI_NOT_CONFIGURED');
      }
      return null;
    }
    return {
      provider,
      apiKey,
      model: env.QUICKSCAN_CHIEF_MODEL?.trim() || DEFAULT_MODEL,
      baseUrl: env.OPENAI_API_BASE_URL?.trim(),
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const model = env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) {
    if (required) {
      throw new QuickScanChiefProviderError(
        'ANTHROPIC_API_KEY and QUICKSCAN_CHIEF_ANTHROPIC_MODEL are required for Anthropic QuickScan Chief',
        'ANTHROPIC_NOT_CONFIGURED',
      );
    }
    return null;
  }
  return {
    provider,
    apiKey,
    model,
    baseUrl: env.ANTHROPIC_API_BASE_URL?.trim(),
  };
}

function providerChain(env: NodeJS.ProcessEnv): StructuredProviderConfig[] {
  const primaryName = providerName(env.QUICKSCAN_CHIEF_PROVIDER, 'openai');
  const primary = providerConfig(env, primaryName, true);
  if (!primary) return [];

  const fallbackRaw = env.QUICKSCAN_CHIEF_FALLBACK_PROVIDER?.trim();
  if (!fallbackRaw) return [primary];
  const fallbackName = providerName(fallbackRaw, primaryName);
  if (fallbackName === primaryName) return [primary];
  const fallback = providerConfig(env, fallbackName, false);
  return fallback ? [primary, fallback] : [primary];
}

export function createOpenAiQuickScanChiefRunner(dependencies: OpenAiQuickScanChiefDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runQuickScanChief(input: QuickScanChiefPromptInput): Promise<QuickScanChiefResult> {
    let result: StructuredJsonResult;
    try {
      result = await runStructuredJson(
        providerChain(env),
        {
          schemaName: 'quickscan_chief_output',
          schema: QUICKSCAN_CHIEF_OUTPUT_SCHEMA,
          systemPrompt: QUICKSCAN_CHIEF_SYSTEM_PROMPT,
          userPrompt: quickScanChiefUserPrompt(input),
          maxOutputTokens: 800,
        },
        {
          fetchFn,
          timeoutMs: timeoutMs(env),
          maxResponseBytes: MAX_RESPONSE_BYTES,
        },
      );
    } catch (error) {
      if (error instanceof QuickScanChiefProviderError) throw error;
      if (error instanceof StructuredProviderError) {
        throw new QuickScanChiefProviderError(error.message, error.code, error.status);
      }
      throw error;
    }

    return {
      recommendation: modelOutput(result.output),
      provenance: {
        provider: result.provider,
        model: result.model,
        responseId: result.responseId,
        promptVersion: QUICKSCAN_CHIEF_PROMPT_VERSION,
      },
    };
  };
}
