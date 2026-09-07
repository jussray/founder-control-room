export type StructuredProviderName = 'openai' | 'anthropic';

export interface StructuredProviderConfig {
  provider: StructuredProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface StructuredJsonRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}

export interface StructuredJsonResult {
  provider: StructuredProviderName;
  model: string;
  responseId: string | null;
  output: unknown;
}

export interface StructuredProviderDependencies {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

interface JsonRecord {
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

export class StructuredProviderError extends Error {
  constructor(
    message: string,
    readonly provider: StructuredProviderName,
    readonly code: string,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'StructuredProviderError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function prefix(provider: StructuredProviderName): 'OPENAI' | 'ANTHROPIC' {
  return provider === 'openai' ? 'OPENAI' : 'ANTHROPIC';
}

function normalizeBaseUrl(config: StructuredProviderConfig): string {
  const fallback = config.provider === 'openai' ? OPENAI_BASE_URL : ANTHROPIC_BASE_URL;
  return (config.baseUrl?.trim() || fallback).replace(/\/$/, '');
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function providerErrorMessage(provider: StructuredProviderName, payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  return `${provider} request failed with status ${status}`;
}

function openAiOutputText(payload: JsonRecord): string | null {
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

function anthropicOutputText(payload: JsonRecord): string | null {
  if (!Array.isArray(payload.content)) return null;
  for (const block of payload.content) {
    if (!isRecord(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      return block.text.trim();
    }
  }
  return null;
}

function requestShape(config: StructuredProviderConfig, request: StructuredJsonRequest) {
  if (config.provider === 'openai') {
    return {
      url: `${normalizeBaseUrl(config)}/responses`,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: {
        model: config.model,
        store: false,
        max_output_tokens: request.maxOutputTokens,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: request.systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: request.userPrompt }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      },
    };
  }

  return {
    url: `${normalizeBaseUrl(config)}/messages`,
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: {
      model: config.model,
      max_tokens: request.maxOutputTokens,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: request.schema,
        },
      },
    },
  };
}

async function runProvider(
  config: StructuredProviderConfig,
  request: StructuredJsonRequest,
  dependencies: StructuredProviderDependencies,
): Promise<StructuredJsonResult> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = dependencies.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const shape = requestShape(config, request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: globalThis.Response;
  let raw: string;
  try {
    response = await fetchFn(shape.url, {
      method: 'POST',
      headers: shape.headers,
      body: JSON.stringify(shape.body),
      signal: controller.signal,
    });

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      throw new StructuredProviderError(
        `${config.provider} response exceeded the allowed size`,
        config.provider,
        `${prefix(config.provider)}_RESPONSE_TOO_LARGE`,
        response.status,
      );
    }

    raw = await response.text();
  } catch (error) {
    if (error instanceof StructuredProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new StructuredProviderError(
        `${config.provider} request timed out`,
        config.provider,
        `${prefix(config.provider)}_TIMEOUT`,
        null,
        true,
      );
    }
    throw new StructuredProviderError(
      error instanceof Error ? error.message : `${config.provider} request failed`,
      config.provider,
      `${prefix(config.provider)}_REQUEST_FAILED`,
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (Buffer.byteLength(raw, 'utf8') > maxResponseBytes) {
    throw new StructuredProviderError(
      `${config.provider} response exceeded the allowed size`,
      config.provider,
      `${prefix(config.provider)}_RESPONSE_TOO_LARGE`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new StructuredProviderError(
      `${config.provider} returned invalid JSON`,
      config.provider,
      `${prefix(config.provider)}_INVALID_RESPONSE`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new StructuredProviderError(
      providerErrorMessage(config.provider, payload, response.status),
      config.provider,
      `${prefix(config.provider)}_HTTP_ERROR`,
      response.status,
      retryableStatus(response.status),
    );
  }

  if (!isRecord(payload)) {
    throw new StructuredProviderError(
      `${config.provider} response body was empty or malformed`,
      config.provider,
      `${prefix(config.provider)}_INVALID_RESPONSE`,
      response.status,
    );
  }

  const outputText = config.provider === 'openai'
    ? openAiOutputText(payload)
    : anthropicOutputText(payload);
  if (!outputText) {
    throw new StructuredProviderError(
      `${config.provider} response did not contain structured output text`,
      config.provider,
      `${prefix(config.provider)}_MISSING_OUTPUT`,
      response.status,
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(outputText);
  } catch {
    throw new StructuredProviderError(
      `${config.provider} structured output was not valid JSON`,
      config.provider,
      `${prefix(config.provider)}_INVALID_OUTPUT_JSON`,
      response.status,
    );
  }

  return {
    provider: config.provider,
    model: config.model,
    responseId: typeof payload.id === 'string' ? payload.id : null,
    output,
  };
}

export async function runStructuredJson(
  providers: StructuredProviderConfig[],
  request: StructuredJsonRequest,
  dependencies: StructuredProviderDependencies = {},
): Promise<StructuredJsonResult> {
  if (providers.length === 0) {
    throw new StructuredProviderError('No model provider is configured', 'openai', 'MODEL_PROVIDER_NOT_CONFIGURED');
  }

  let lastError: StructuredProviderError | null = null;
  for (let index = 0; index < providers.length; index += 1) {
    const config = providers[index];
    if (!config) continue;
    try {
      return await runProvider(config, request, dependencies);
    } catch (error) {
      if (!(error instanceof StructuredProviderError)) throw error;
      lastError = error;
      const hasFallback = index < providers.length - 1;
      if (!error.retryable || !hasFallback) throw error;
    }
  }

  throw lastError ?? new StructuredProviderError('No model provider could run', 'openai', 'MODEL_PROVIDER_NOT_CONFIGURED');
}
