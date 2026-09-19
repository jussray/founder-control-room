import type { OperatorRelayRequestV1, RelayOperatorId } from './operatorRelay.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import { operatorRelayAdapterFromTextProvider } from './operatorRelayProvider.js';
import {
  operatorRelayHandoffAdapter,
  operatorRelayTransportAvailability,
  resolveOperatorRelayTransport,
} from './operatorRelayTransport.js';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 60_000;
const ANTHROPIC_API_VERSION = '2023-06-01';
const SAFE_PROVIDER_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]{1,200}$/;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
  /\b(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["']?[^\s"']{8,}/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/,
  /\bpplx-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
] as const;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function relayPrompt(request: OperatorRelayRequestV1): string {
  return [
    'You are responding through Founder Control Room as a bounded peer AI operator.',
    'Do not claim founder approval, mutation authority, merge/deploy/publish authority, credentials, or tool authority.',
    `Requested capability: ${request.capability}`,
    `Goal: ${request.goal}`,
    'Context:',
    request.context.summary,
    'Return the useful answer only. State material uncertainty explicitly.',
  ].join('\n\n');
}

function ensureRelaySensitivity(request: OperatorRelayRequestV1): void {
  if (request.sensitivity === 'restricted') {
    throw new Error('restricted relay context requires a separately approved provider data policy');
  }
}

function ensureNoSecretValues(request: OperatorRelayRequestV1): void {
  const outbound = `${request.goal}\n${request.context.summary}`;
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(outbound))) {
    throw new Error('relay context appears to contain secret-bearing material');
  }
}

async function boundedResponseText(response: Response, label: string): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PROVIDER_RESPONSE_BYTES) {
      try {
        await response.body?.cancel();
      } catch {
        // The size receipt remains valid even if an already-closed stream cannot be cancelled.
      }
      throw new Error(`${label} response exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
    }
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`${label} response exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function jsonResponse(response: Response, label: string): Promise<JsonRecord> {
  if (!response.ok) {
    // Provider error bodies are intentionally never promoted into FCR errors.
    // They are untrusted, can be arbitrarily large, and can echo credentials or
    // submitted context. Status is sufficient for the bounded failure receipt.
    try {
      await response.body?.cancel();
    } catch {
      // Failure to cancel an already-closed body does not change provider truth.
    }
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }

  const text = await boundedResponseText(response, label);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON output`);
  }
  const parsed = record(body);
  if (!parsed) throw new Error(`${label} returned an invalid response object`);
  return parsed;
}

async function invokeJsonProvider(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  label: string,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    // Do not serialize provider/fetch exceptions. Transport exceptions can
    // include request metadata, URLs, proxies, or secret-bearing diagnostics.
    throw new Error(`${label} request failed`);
  }
  return jsonResponse(response, label);
}

function openAiText(body: JsonRecord): string {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  const output = Array.isArray(body.output) ? body.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const message = record(item);
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const entry of content) {
      const block = record(entry);
      if (typeof block?.text === 'string' && block.text.trim()) parts.push(block.text.trim());
    }
  }
  if (parts.length === 0) throw new Error('Responses-compatible relay response contained no text');
  return parts.join('\n');
}

function anthropicText(body: JsonRecord): { text: string; providerResponseId: string } {
  if (body.type !== 'message' || body.role !== 'assistant') {
    throw new Error('Anthropic relay returned an invalid Messages response envelope');
  }
  const providerResponseId = typeof body.id === 'string' ? body.id.trim() : '';
  if (!SAFE_PROVIDER_ID.test(providerResponseId)) {
    throw new Error('Anthropic relay returned invalid response identity');
  }
  const content = Array.isArray(body.content) ? body.content : [];
  const parts = content.flatMap((entry) => {
    const block = record(entry);
    return block?.type === 'text' && typeof block.text === 'string' && block.text.trim()
      ? [block.text.trim()]
      : [];
  });
  if (parts.length === 0) throw new Error('Anthropic relay response contained no text');
  return { text: parts.join('\n'), providerResponseId };
}

function safeEvidencePart(value: unknown, fallback: string, pattern: RegExp): string {
  return typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : fallback;
}

function evidenceRefFromId(provider: string, configuredModel: string, providerResponseId: string): string {
  const model = safeEvidencePart(configuredModel, 'configured-model', SAFE_MODEL_ID);
  return `provider:${provider}:model:${model}:response:${providerResponseId}`;
}

function evidenceRef(provider: string, configuredModel: string, body: JsonRecord): string {
  const id = safeEvidencePart(body.id, 'unidentified-response', SAFE_PROVIDER_ID);
  return evidenceRefFromId(provider, configuredModel, id);
}

function prepareProviderRequest(request: OperatorRelayRequestV1): string {
  ensureRelaySensitivity(request);
  ensureNoSecretValues(request);
  return relayPrompt(request);
}

function handoffIfConfigured(
  adapters: OperatorRelayAdapters,
  operator: RelayOperatorId,
  providerApiAvailable: boolean,
  env: NodeJS.ProcessEnv,
): void {
  if (providerApiAvailable || adapters[operator]) return;
  const resolution = resolveOperatorRelayTransport(
    operatorRelayTransportAvailability(operator, false, env),
  );
  if (resolution.mode === 'handoff') adapters[operator] = operatorRelayHandoffAdapter(resolution);
}

export function createServerOperatorRelayAdapters(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): OperatorRelayAdapters {
  const adapters: OperatorRelayAdapters = {};
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const openAiModel = env.FCR_RELAY_OPENAI_MODEL?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = env.FCR_RELAY_ANTHROPIC_MODEL?.trim();
  const perplexityKey = env.PERPLEXITY_API_KEY?.trim();
  const perplexityModel = env.FCR_RELAY_PERPLEXITY_MODEL?.trim();

  const openAiAvailable = Boolean(openAiKey && openAiModel);
  const anthropicAvailable = Boolean(anthropicKey && anthropicModel);
  const perplexityAvailable = Boolean(perplexityKey && perplexityModel);

  if (openAiKey && openAiModel) {
    adapters.codex = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        const prompt = prepareProviderRequest(request);
        const body = await invokeJsonProvider(fetchImpl, 'https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: openAiModel,
            input: prompt,
            store: false,
            max_output_tokens: 2_000,
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, 'OpenAI relay');
        return { text: openAiText(body), evidenceRef: evidenceRef('openai', openAiModel, body) };
      },
    });
  }

  if (anthropicKey && anthropicModel) {
    adapters['claude-code'] = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        const prompt = prepareProviderRequest(request);
        const body = await invokeJsonProvider(fetchImpl, 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 2_000,
            messages: [{ role: 'user', content: prompt }],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, 'Anthropic relay');
        const message = anthropicText(body);
        return {
          text: message.text,
          evidenceRef: evidenceRefFromId('anthropic', anthropicModel, message.providerResponseId),
        };
      },
    });
  }

  if (perplexityKey && perplexityModel) {
    adapters.perplexity = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        const prompt = prepareProviderRequest(request);
        const body = await invokeJsonProvider(fetchImpl, 'https://api.perplexity.ai/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: perplexityModel,
            input: prompt,
            store: false,
            max_output_tokens: 2_000,
            tools: [{ type: 'web_search' }],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, 'Perplexity relay');
        return { text: openAiText(body), evidenceRef: evidenceRef('perplexity', perplexityModel, body) };
      },
    });
  }

  handoffIfConfigured(adapters, 'codex', openAiAvailable, env);
  handoffIfConfigured(adapters, 'claude-code', anthropicAvailable, env);
  handoffIfConfigured(adapters, 'perplexity', perplexityAvailable, env);

  return adapters;
}
