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

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
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
  const raw = Number(env.MIRROR_ENGINE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function baseUrl(env: NodeJS.ProcessEnv): string {
  return (env.OPENAI_API_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
}

export function createOpenAiMirrorRunner(dependencies: OpenAiMirrorDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runMirror(input: MirrorRunInput): Promise<MirrorModelResult> {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new MirrorProviderError('OPENAI_API_KEY is not configured for Mirror Engine', 'OPENAI_NOT_CONFIGURED');
    }

    const model = env.MIRROR_ENGINE_MODEL?.trim() || DEFAULT_MODEL;
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
          store: false,
          max_output_tokens: 1_600,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: MIRROR_SYSTEM_PROMPT }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: mirrorUserPrompt(input) }],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'mirror_engine_output',
              strict: true,
              schema: MIRROR_OUTPUT_SCHEMA,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MirrorProviderError('OpenAI Mirror Engine request timed out', 'OPENAI_TIMEOUT');
      }
      throw new MirrorProviderError(
        error instanceof Error ? error.message : 'OpenAI Mirror Engine request failed',
        'OPENAI_REQUEST_FAILED',
      );
    } finally {
      clearTimeout(timer);
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new MirrorProviderError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
    }

    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new MirrorProviderError('OpenAI response exceeded the allowed size', 'OPENAI_RESPONSE_TOO_LARGE', response.status);
    }

    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      throw new MirrorProviderError('OpenAI returned invalid JSON', 'OPENAI_INVALID_RESPONSE', response.status);
    }

    if (!response.ok) {
      const errorRecord = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
      const providerMessage = errorRecord && typeof errorRecord.message === 'string'
        ? errorRecord.message
        : `OpenAI request failed with status ${response.status}`;
      throw new MirrorProviderError(providerMessage, 'OPENAI_HTTP_ERROR', response.status);
    }
    if (!isRecord(payload)) {
      throw new MirrorProviderError('OpenAI response body was empty or malformed', 'OPENAI_INVALID_RESPONSE', response.status);
    }

    const outputText = responseText(payload);
    if (!outputText) {
      throw new MirrorProviderError('OpenAI response did not contain structured output text', 'OPENAI_MISSING_OUTPUT', response.status);
    }

    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(outputText);
    } catch {
      throw new MirrorProviderError('OpenAI structured output was not valid JSON', 'OPENAI_INVALID_OUTPUT_JSON', response.status);
    }

    return {
      output: modelOutput(parsedOutput),
      provenance: {
        provider: 'openai',
        model,
        responseId: typeof payload.id === 'string' ? payload.id : null,
        promptVersion: MIRROR_PROMPT_VERSION,
        storedByProvider: false,
      },
    };
  };
}