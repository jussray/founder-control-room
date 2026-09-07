import {
  runStructuredJson,
  StructuredProviderError,
  type StructuredJsonResult,
  type StructuredProviderConfig,
  type StructuredProviderName,
} from '../aiRuntime/structuredProvider.js';
import {
  MIRROR_OUTPUT_SCHEMA,
  MIRROR_PROMPT_VERSION,
  MIRROR_SYSTEM_PROMPT,
  mirrorUserPrompt,
} from './prompts.js';
import {
  MIRROR_INTENT_TAGS,
  type MirrorIntentTag,
  type MirrorModelOutput,
  type MirrorModelResult,
  type MirrorMoveGoal,
  type MirrorRunInput,
} from './types.js';

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

interface JsonRecord {
  [key: string]: unknown;
}

export interface OpenAiMirrorDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
}

export class MirrorProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'MirrorProviderError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new MirrorProviderError(`Model output field ${field} must be a string`, 'INVALID_MODEL_OUTPUT');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new MirrorProviderError(`Model output field ${field} is outside its allowed length`, 'INVALID_MODEL_OUTPUT');
  }
  return trimmed;
}

function nullableString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null;
  return stringValue(value, field, maxLength);
}

function intentTags(value: unknown): MirrorIntentTag[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new MirrorProviderError('Model output intent_tags must contain 1-3 values', 'INVALID_MODEL_OUTPUT');
  }
  const allowed = new Set<string>(MIRROR_INTENT_TAGS);
  const tags = value.map((tag) => stringValue(tag, 'intent_tags', 20));
  if (tags.some((tag) => !allowed.has(tag)) || new Set(tags).size !== tags.length) {
    throw new MirrorProviderError('Model output intent_tags contains unsupported or duplicate values', 'INVALID_MODEL_OUTPUT');
  }
  return tags as MirrorIntentTag[];
}

function moveGoal(value: unknown): MirrorMoveGoal {
  const goal = stringValue(value, 'goal', 20);
  if (goal !== 'money' && goal !== 'people' && goal !== 'build') {
    throw new MirrorProviderError('Model output goal is unsupported', 'INVALID_MODEL_OUTPUT');
  }
  return goal;
}

function factualClaims(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new MirrorProviderError('Model output factual_claims must be a bounded array', 'INVALID_MODEL_OUTPUT');
  }
  return value.map((claim) => stringValue(claim, 'factual_claims', 500));
}

function modelOutput(value: unknown): MirrorModelOutput {
  if (!isRecord(value)) {
    throw new MirrorProviderError('Model output must be an object', 'INVALID_MODEL_OUTPUT');
  }

  const timeEstimateMinutes = Number(value.time_estimate_minutes);
  if (!Number.isInteger(timeEstimateMinutes) || timeEstimateMinutes < 5 || timeEstimateMinutes > 15) {
    throw new MirrorProviderError('Model output time_estimate_minutes must be an integer from 5 to 15', 'INVALID_MODEL_OUTPUT');
  }

  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new MirrorProviderError('Model output confidence must be between 0 and 1', 'INVALID_MODEL_OUTPUT');
  }

  if (typeof value.contains_external_factual_claims !== 'boolean') {
    throw new MirrorProviderError('Model output contains_external_factual_claims must be boolean', 'INVALID_MODEL_OUTPUT');
  }

  const claims = factualClaims(value.factual_claims);
  if (value.contains_external_factual_claims !== (claims.length > 0)) {
    throw new MirrorProviderError('Model output factual claim flag does not match the claim ledger', 'INVALID_MODEL_OUTPUT');
  }

  const script = nullableString(value.script, 'script', 2_500);
  const toneGuardedScript = nullableString(value.tone_guarded_script, 'tone_guarded_script', 2_500);
  if ((script === null) !== (toneGuardedScript === null)) {
    throw new MirrorProviderError('Model output script and tone_guarded_script must both be null or both be strings', 'INVALID_MODEL_OUTPUT');
  }

  return {
    headline: stringValue(value.headline, 'headline', 120),
    summary: stringValue(value.summary, 'summary', 800),
    intentTags: intentTags(value.intent_tags),
    actionText: stringValue(value.action_text, 'action_text', 500),
    script,
    timeEstimateMinutes,
    goal: moveGoal(value.goal),
    confidence,
    toneGuardedScript,
    containsExternalFactualClaims: value.contains_external_factual_claims,
    factualClaims: claims,
  };
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.MIRROR_ENGINE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function providerName(value: string | undefined, fallback: StructuredProviderName): StructuredProviderName {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'openai' || normalized === 'anthropic') return normalized;
  throw new MirrorProviderError(`Unsupported Mirror Engine provider: ${normalized}`, 'MODEL_PROVIDER_INVALID');
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
        throw new MirrorProviderError('OPENAI_API_KEY is not configured for Mirror Engine', 'OPENAI_NOT_CONFIGURED');
      }
      return null;
    }
    return {
      provider,
      apiKey,
      model: env.MIRROR_ENGINE_MODEL?.trim() || DEFAULT_MODEL,
      baseUrl: env.OPENAI_API_BASE_URL?.trim(),
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const model = env.MIRROR_ENGINE_ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) {
    if (required) {
      throw new MirrorProviderError(
        'ANTHROPIC_API_KEY and MIRROR_ENGINE_ANTHROPIC_MODEL are required for Anthropic Mirror Engine',
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
  const primaryName = providerName(env.MIRROR_ENGINE_PROVIDER, 'openai');
  const primary = providerConfig(env, primaryName, true);
  if (!primary) return [];

  const fallbackRaw = env.MIRROR_ENGINE_FALLBACK_PROVIDER?.trim();
  if (!fallbackRaw) return [primary];
  const fallbackName = providerName(fallbackRaw, primaryName);
  if (fallbackName === primaryName) return [primary];
  const fallback = providerConfig(env, fallbackName, false);
  return fallback ? [primary, fallback] : [primary];
}

export function createOpenAiMirrorRunner(dependencies: OpenAiMirrorDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runMirror(input: MirrorRunInput): Promise<MirrorModelResult> {
    let result: StructuredJsonResult;
    try {
      result = await runStructuredJson(
        providerChain(env),
        {
          schemaName: 'mirror_engine_output',
          schema: MIRROR_OUTPUT_SCHEMA,
          systemPrompt: MIRROR_SYSTEM_PROMPT,
          userPrompt: mirrorUserPrompt(input),
          maxOutputTokens: 1_600,
        },
        {
          fetchFn,
          timeoutMs: timeoutMs(env),
          maxResponseBytes: MAX_RESPONSE_BYTES,
        },
      );
    } catch (error) {
      if (error instanceof MirrorProviderError) throw error;
      if (error instanceof StructuredProviderError) {
        throw new MirrorProviderError(error.message, error.code, error.status);
      }
      throw error;
    }

    return {
      output: modelOutput(result.output),
      provenance: {
        provider: result.provider,
        model: result.model,
        responseId: result.responseId,
        promptVersion: MIRROR_PROMPT_VERSION,
        storedByProvider: result.provider === 'openai' ? false : null,
      },
    };
  };
}
