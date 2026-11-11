import type { FirstSliceMove, FriendRuntimeProvider } from '../chief/firstSliceContracts.js';
import type { ModelExecutionState } from '../model/execution.js';
import {
  MIRROR_INTENT_TAGS,
  type MirrorIntentTag,
} from './types.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const DEFAULT_PERPLEXITY_MODEL = 'sonar';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_OUTPUT_TOKENS = 1_200;

export const FRIEND_PROMPT_VERSION = 'friend-intake-v1-2026-09-08';

interface JsonRecord {
  [key: string]: unknown;
}

export interface FriendRuntimeInput {
  transcript: string;
  timeEnergyContext: string;
  voiceProfile: string | null;
}

export interface FriendRuntimeProvenance {
  provider: FriendRuntimeProvider;
  model: string;
  responseId: string | null;
  promptVersion: string;
  providerStorageMode: 'local_only' | 'disabled_request' | 'provider_default';
  webSearchUsed: boolean;
}

export interface FriendRuntimeResult {
  mirror: {
    headline: string;
    summary: string;
  };
  tags: MirrorIntentTag[];
  move: FirstSliceMove;
  provenance: FriendRuntimeProvenance;
  modelExecutionState: ModelExecutionState;
}

export interface FriendRuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
}

export class FriendRuntimeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly executionState: Exclude<ModelExecutionState, 'succeeded' | 'not_used'>,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'FriendRuntimeError';
  }
}

const FRIEND_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'summary',
    'intent_tags',
    'move_kind',
    'action_text',
    'rationale',
    'time_estimate_minutes',
    'gate_warning',
  ],
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 120 },
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    intent_tags: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'string', enum: [...MIRROR_INTENT_TAGS] },
    },
    move_kind: {
      type: 'string',
      enum: ['tiny_move', 'protective_move', 'clarifying_question'],
    },
    action_text: { type: 'string', minLength: 1, maxLength: 500 },
    rationale: { type: ['string', 'null'], maxLength: 500 },
    time_estimate_minutes: { type: ['integer', 'null'], minimum: 5, maximum: 15 },
    gate_warning: { type: ['string', 'null'], maxLength: 500 },
  },
} as const;

const FRIEND_SYSTEM_PROMPT = `You are Friend inside Founder Control Room.

Return one bounded reflection and exactly one next move as strict JSON.

Rules:
- Mirror the founder's meaning without inventing facts, memories, authority, urgency, or external verification.
- Assign 1-3 tags only from: money, people, build, health, kids, legal, rest.
- Return exactly one move: tiny_move, protective_move, or clarifying_question.
- A tiny_move must be reversible and take 5-15 minutes.
- Never create, send, publish, schedule, deploy, purchase, merge, contact, or mutate an external system.
- Never claim model output is verified evidence or founder approval.
- Do not retrieve or assume memory.
- Preserve the founder's own voice without manufacturing dialect.
- Do not expose or repeat credentials.
- If the input itself suggests uncertainty or sensitivity that cannot be handled safely, prefer protective_move or clarifying_question.
- Keep the result concise and founder-readable.`;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new FriendRuntimeError(
      `Friend output field ${field} must be a string`,
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new FriendRuntimeError(
      `Friend output field ${field} is outside its allowed length`,
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }
  return trimmed;
}

function nullableString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null;
  return boundedString(value, field, maxLength);
}

function parseTags(value: unknown): MirrorIntentTag[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new FriendRuntimeError(
      'Friend output intent_tags must contain 1-3 values',
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }
  const allowed = new Set<string>(MIRROR_INTENT_TAGS);
  const tags = value.map((tag) => boundedString(tag, 'intent_tags', 20));
  if (tags.some((tag) => !allowed.has(tag)) || new Set(tags).size !== tags.length) {
    throw new FriendRuntimeError(
      'Friend output intent_tags contains unsupported or duplicate values',
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }
  return tags as MirrorIntentTag[];
}

function parseModelOutput(value: unknown): Pick<FriendRuntimeResult, 'mirror' | 'tags' | 'move'> {
  if (!isRecord(value)) {
    throw new FriendRuntimeError(
      'Friend model output must be an object',
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }

  const kind = boundedString(value.move_kind, 'move_kind', 32);
  if (kind !== 'tiny_move' && kind !== 'protective_move' && kind !== 'clarifying_question') {
    throw new FriendRuntimeError(
      'Friend output move_kind is unsupported',
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }

  let timeEstimateMinutes: number | null = null;
  if (value.time_estimate_minutes !== null) {
    const parsed = Number(value.time_estimate_minutes);
    if (!Number.isInteger(parsed) || parsed < 5 || parsed > 15) {
      throw new FriendRuntimeError(
        'Friend output time_estimate_minutes must be null or an integer from 5 to 15',
        'FRIEND_SCHEMA_INVALID',
        'schema_invalid',
      );
    }
    timeEstimateMinutes = parsed;
  }

  if (kind === 'tiny_move' && timeEstimateMinutes === null) {
    throw new FriendRuntimeError(
      'Friend tiny_move requires a time estimate',
      'FRIEND_SCHEMA_INVALID',
      'schema_invalid',
    );
  }

  return {
    mirror: {
      headline: boundedString(value.headline, 'headline', 120),
      summary: boundedString(value.summary, 'summary', 800),
    },
    tags: parseTags(value.intent_tags),
    move: {
      kind,
      text: boundedString(value.action_text, 'action_text', 500),
      rationale: nullableString(value.rationale, 'rationale', 500),
      timeEstimateMinutes,
      gateWarning: nullableString(value.gate_warning, 'gate_warning', 500),
    },
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function deterministicTags(text: string): MirrorIntentTag[] {
  const normalized = text.toLowerCase();
  const tags: MirrorIntentTag[] = [];
  const candidates: Array<[MirrorIntentTag, RegExp]> = [
    ['money', /\b(money|revenue|sale|bank|loan|invest|customer|client|pay|price)\b/],
    ['people', /\b(person|people|team|partner|friend|relationship|customer|client)\b/],
    ['build', /\b(build|ship|code|repo|project|product|app|site|fix|test)\b/],
    ['health', /\b(health|rest|sleep|energy)\b/],
    ['kids', /\b(kid|kids|child|children|family)\b/],
    ['legal', /\b(legal|law|court|attorney|lawyer)\b/],
    ['rest', /\b(rest|pause|tired|sleep|break)\b/],
  ];

  for (const [tag, pattern] of candidates) {
    if (pattern.test(normalized) && !tags.includes(tag)) tags.push(tag);
    if (tags.length === 3) break;
  }
  return tags.length > 0 ? tags : ['build'];
}

function deterministicResult(input: FriendRuntimeInput): FriendRuntimeResult {
  const normalized = collapseWhitespace(input.transcript);
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;

  return {
    mirror: {
      headline: truncate(firstSentence, 96),
      summary: truncate(normalized, 700),
    },
    tags: deterministicTags(normalized),
    move: {
      kind: 'tiny_move',
      text: 'Choose the smallest reversible step in this note and do only that.',
      rationale: 'Deterministic Friend keeps the next step bounded instead of expanding the plan.',
      timeEstimateMinutes: 10,
      gateWarning: 'No external action is authorized by this suggestion.',
    },
    provenance: {
      provider: 'deterministic',
      model: 'friend-deterministic-v1',
      responseId: null,
      promptVersion: FRIEND_PROMPT_VERSION,
      providerStorageMode: 'local_only',
      webSearchUsed: false,
    },
    modelExecutionState: 'not_used',
  };
}

function runtimeProviderSet(env: NodeJS.ProcessEnv): Set<FriendRuntimeProvider> {
  const configured = env.FRIEND_RUNTIME_PROVIDERS?.trim();
  if (!configured) return new Set<FriendRuntimeProvider>();

  const values = configured
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(
    values.filter(
      (value): value is FriendRuntimeProvider =>
        value === 'deterministic'
        || value === 'openai'
        || value === 'anthropic'
        || value === 'perplexity',
    ),
  );
}

function providerBaseUrl(
  provider: Exclude<FriendRuntimeProvider, 'deterministic'>,
  env: NodeJS.ProcessEnv,
): string {
  const configured = provider === 'openai'
    ? env.OPENAI_API_BASE_URL
    : provider === 'anthropic'
      ? env.ANTHROPIC_API_BASE_URL
      : env.PERPLEXITY_API_BASE_URL;
  const fallback = provider === 'openai'
    ? DEFAULT_OPENAI_BASE_URL
    : provider === 'anthropic'
      ? DEFAULT_ANTHROPIC_BASE_URL
      : DEFAULT_PERPLEXITY_BASE_URL;
  const candidate = configured?.trim() || fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new FriendRuntimeError(
      'Friend runtime provider base URL is invalid',
      'FRIEND_PROVIDER_BASE_URL_INVALID',
      'provider_unavailable',
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FriendRuntimeError(
      'Friend runtime provider base URL uses an unsupported scheme',
      'FRIEND_PROVIDER_BASE_URL_INVALID',
      'provider_unavailable',
    );
  }

  return parsed.toString().replace(/\/$/, '');
}

export function assertFriendRuntimeProviderReady(
  provider: FriendRuntimeProvider,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (provider === 'deterministic') return;

  if (env.FRIEND_MODELS_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new FriendRuntimeError(
      'Friend runtime models are disabled',
      'FRIEND_MODELS_DISABLED',
      'blocked',
    );
  }

  if (!runtimeProviderSet(env).has(provider)) {
    throw new FriendRuntimeError(
      'Requested Friend runtime provider is not allowed',
      'FRIEND_PROVIDER_NOT_ALLOWED',
      'blocked',
    );
  }

  const credential = provider === 'openai'
    ? env.OPENAI_API_KEY
    : provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : env.PERPLEXITY_API_KEY;

  if (!credential?.trim()) {
    const label = provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Perplexity';
    throw new FriendRuntimeError(
      `${label} Friend runtime is not configured`,
      `FRIEND_${provider.toUpperCase()}_NOT_CONFIGURED`,
      'provider_unavailable',
    );
  }

  providerBaseUrl(provider, env);
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.FRIEND_MODEL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

function modelPrompt(input: FriendRuntimeInput): string {
  return JSON.stringify({
    task: 'Run Friend Intake without memory retrieval or external action.',
    transcript: input.transcript,
    time_energy_context: input.timeEnergyContext,
    voice_profile: input.voiceProfile,
  });
}

function timedOut(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function requestText(
  response: globalThis.Response,
  provider: FriendRuntimeProvider,
): Promise<{ raw: string; payload: unknown }> {
  const declared = response.headers.get('content-length');
  const declaredLength = declared === null ? Number.NaN : Number(declared);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new FriendRuntimeError(
      `${provider} response exceeded the allowed size`,
      'FRIEND_RESPONSE_TOO_LARGE',
      'schema_invalid',
      response.status,
    );
  }

  let raw = '';
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new FriendRuntimeError(
            `${provider} response exceeded the allowed size`,
            'FRIEND_RESPONSE_TOO_LARGE',
            'schema_invalid',
            response.status,
          );
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch (error) {
      if (error instanceof FriendRuntimeError) throw error;
      if (timedOut(error)) {
        throw new FriendRuntimeError(
          `${provider} Friend request timed out`,
          'FRIEND_PROVIDER_TIMEOUT',
          'timed_out',
          response.status,
        );
      }
      throw new FriendRuntimeError(
        `${provider} response body could not be read`,
        'FRIEND_PROVIDER_REQUEST_FAILED',
        'provider_unavailable',
        response.status,
      );
    }
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new FriendRuntimeError(
      `${provider} returned invalid JSON`,
      'FRIEND_PROVIDER_INVALID_RESPONSE',
      'schema_invalid',
      response.status,
    );
  }

  return { raw, payload };
}

function openAiOutputText(payload: JsonRecord): string | null {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content)
        && content.type === 'output_text'
        && typeof content.text === 'string'
        && content.text.trim()
      ) {
        return content.text.trim();
      }
    }
  }
  return null;
}

function anthropicOutputText(payload: JsonRecord): string | null {
  if (!Array.isArray(payload.content)) return null;
  for (const item of payload.content) {
    if (isRecord(item) && item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
      return item.text.trim();
    }
  }
  return null;
}

function perplexityOutputText(payload: JsonRecord): string | null {
  if (!Array.isArray(payload.choices) || payload.choices.length < 1) return null;
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === 'string' && first.message.content.trim()
    ? first.message.content.trim()
    : null;
}

function parseStructuredText(text: string | null): Pick<FriendRuntimeResult, 'mirror' | 'tags' | 'move'> {
  if (!text) {
    throw new FriendRuntimeError(
      'Friend provider response did not contain structured output',
      'FRIEND_PROVIDER_MISSING_OUTPUT',
      'schema_invalid',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FriendRuntimeError(
      'Friend structured output was not valid JSON',
      'FRIEND_PROVIDER_INVALID_OUTPUT_JSON',
      'schema_invalid',
    );
  }
  return parseModelOutput(parsed);
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  provider: FriendRuntimeProvider,
  env: NodeJS.ProcessEnv,
): Promise<globalThis.Response> {
  const signal = AbortSignal.timeout(timeoutMs(env));

  try {
    return await fetchFn(url, { ...init, signal });
  } catch (error) {
    if (timedOut(error)) {
      throw new FriendRuntimeError(
        `${provider} Friend request timed out`,
        'FRIEND_PROVIDER_TIMEOUT',
        'timed_out',
      );
    }
    throw new FriendRuntimeError(
      error instanceof Error ? error.message : `${provider} Friend request failed`,
      'FRIEND_PROVIDER_REQUEST_FAILED',
      'provider_unavailable',
    );
  }
}

async function runOpenAi(
  input: FriendRuntimeInput,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<FriendRuntimeResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new FriendRuntimeError(
      'OpenAI Friend runtime is not configured',
      'FRIEND_OPENAI_NOT_CONFIGURED',
      'provider_unavailable',
    );
  }
  const model = env.FRIEND_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  const response = await fetchWithTimeout(
    fetchFn,
    `${providerBaseUrl('openai', env)}/responses`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: FRIEND_SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: modelPrompt(input) }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'friend_intake_output',
            strict: true,
            schema: FRIEND_OUTPUT_SCHEMA,
          },
        },
      }),
    },
    'openai',
    env,
  );

  const { payload } = await requestText(response, 'openai');
  if (!response.ok) {
    throw new FriendRuntimeError(
      `OpenAI Friend request failed with status ${response.status}`,
      'FRIEND_OPENAI_HTTP_ERROR',
      'provider_unavailable',
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new FriendRuntimeError(
      'OpenAI Friend response was malformed',
      'FRIEND_PROVIDER_INVALID_RESPONSE',
      'schema_invalid',
      response.status,
    );
  }

  return {
    ...parseStructuredText(openAiOutputText(payload)),
    provenance: {
      provider: 'openai',
      model,
      responseId: typeof payload.id === 'string' ? payload.id : null,
      promptVersion: FRIEND_PROMPT_VERSION,
      providerStorageMode: 'disabled_request',
      webSearchUsed: false,
    },
    modelExecutionState: 'succeeded',
  };
}

async function runAnthropic(
  input: FriendRuntimeInput,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<FriendRuntimeResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new FriendRuntimeError(
      'Anthropic Friend runtime is not configured',
      'FRIEND_ANTHROPIC_NOT_CONFIGURED',
      'provider_unavailable',
    );
  }
  const model = env.FRIEND_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;

  const response = await fetchWithTimeout(
    fetchFn,
    `${providerBaseUrl('anthropic', env)}/messages`,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: FRIEND_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: modelPrompt(input) }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: FRIEND_OUTPUT_SCHEMA,
          },
        },
      }),
    },
    'anthropic',
    env,
  );

  const { payload } = await requestText(response, 'anthropic');
  if (!response.ok) {
    throw new FriendRuntimeError(
      `Anthropic Friend request failed with status ${response.status}`,
      'FRIEND_ANTHROPIC_HTTP_ERROR',
      'provider_unavailable',
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new FriendRuntimeError(
      'Anthropic Friend response was malformed',
      'FRIEND_PROVIDER_INVALID_RESPONSE',
      'schema_invalid',
      response.status,
    );
  }

  return {
    ...parseStructuredText(anthropicOutputText(payload)),
    provenance: {
      provider: 'anthropic',
      model,
      responseId: typeof payload.id === 'string' ? payload.id : null,
      promptVersion: FRIEND_PROMPT_VERSION,
      providerStorageMode: 'provider_default',
      webSearchUsed: false,
    },
    modelExecutionState: 'succeeded',
  };
}

async function runPerplexity(
  input: FriendRuntimeInput,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<FriendRuntimeResult> {
  const apiKey = env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    throw new FriendRuntimeError(
      'Perplexity Friend runtime is not configured',
      'FRIEND_PERPLEXITY_NOT_CONFIGURED',
      'provider_unavailable',
    );
  }
  const model = env.FRIEND_PERPLEXITY_MODEL?.trim() || DEFAULT_PERPLEXITY_MODEL;

  const response = await fetchWithTimeout(
    fetchFn,
    `${providerBaseUrl('perplexity', env)}/v1/sonar`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: FRIEND_SYSTEM_PROMPT },
          { role: 'user', content: modelPrompt(input) },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        disable_search: true,
        return_images: false,
        return_related_questions: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            schema: FRIEND_OUTPUT_SCHEMA,
          },
        },
      }),
    },
    'perplexity',
    env,
  );

  const { payload } = await requestText(response, 'perplexity');
  if (!response.ok) {
    throw new FriendRuntimeError(
      `Perplexity Friend request failed with status ${response.status}`,
      'FRIEND_PERPLEXITY_HTTP_ERROR',
      'provider_unavailable',
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new FriendRuntimeError(
      'Perplexity Friend response was malformed',
      'FRIEND_PROVIDER_INVALID_RESPONSE',
      'schema_invalid',
      response.status,
    );
  }

  return {
    ...parseStructuredText(perplexityOutputText(payload)),
    provenance: {
      provider: 'perplexity',
      model,
      responseId: typeof payload.id === 'string' ? payload.id : null,
      promptVersion: FRIEND_PROMPT_VERSION,
      providerStorageMode: 'provider_default',
      webSearchUsed: false,
    },
    modelExecutionState: 'succeeded',
  };
}

export function createFriendRuntimeRunner(dependencies: FriendRuntimeDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchFn = dependencies.fetchFn ?? fetch;

  return async function runFriendRuntime(
    provider: FriendRuntimeProvider,
    input: FriendRuntimeInput,
  ): Promise<FriendRuntimeResult> {
    if (provider === 'deterministic') return deterministicResult(input);

    assertFriendRuntimeProviderReady(provider, env);

    if (provider === 'openai') return runOpenAi(input, env, fetchFn);
    if (provider === 'anthropic') return runAnthropic(input, env, fetchFn);
    return runPerplexity(input, env, fetchFn);
  };
}
