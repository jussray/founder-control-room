import type { OperatorRelayRequestV1 } from './operatorRelay.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import { operatorRelayAdapterFromTextProvider } from './operatorRelayProvider.js';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 60_000;
const ANTHROPIC_API_VERSION = '2023-06-01';
const MAX_PROVIDER_RESPONSE_ID_LENGTH = 200;
const SAFE_GEMINI_MODEL = /^[A-Za-z0-9._-]{1,160}$/;
const SAFE_PERPLEXITY_AGENT_MODEL = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const SEMANTIC_PEER_REVIEW_SPEND_MODE = 'paused' as const;

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

function ensureRelaySpendPolicy(request: OperatorRelayRequestV1): void {
  if (request.capability === 'review') {
    throw new Error('semantic peer review is paused by founder cost-control policy');
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
    // Do not serialize the provider/fetch exception. A transport exception can
    // contain request metadata, URLs, proxies, or secret-bearing diagnostics.
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
  if (parts.length === 0) throw new Error('OpenAI relay response contained no text');
  return parts.join('\n');
}

function anthropicText(body: JsonRecord): string {
  const rawId = typeof body.id === 'string' ? body.id.trim() : '';
  if (
    !rawId
    || rawId.length > MAX_PROVIDER_RESPONSE_ID_LENGTH
    || !/^[A-Za-z0-9._:-]+$/.test(rawId)
  ) {
    throw new Error('Anthropic relay returned invalid response identity');
  }
  if (body.type !== 'message' || body.role !== 'assistant') {
    throw new Error('Anthropic relay returned invalid message envelope');
  }

  const content = Array.isArray(body.content) ? body.content : [];
  const parts = content.flatMap((entry) => {
    const block = record(entry);
    return block?.type === 'text' && typeof block.text === 'string' && block.text.trim()
      ? [block.text.trim()]
      : [];
  });
  if (parts.length === 0) throw new Error('Anthropic relay response contained no text');
  return parts.join('\n');
}

function geminiResponseId(body: JsonRecord): string {
  const rawId = typeof body.responseId === 'string' ? body.responseId.trim() : '';
  if (
    !rawId
    || rawId.length > MAX_PROVIDER_RESPONSE_ID_LENGTH
    || !/^[A-Za-z0-9._:-]+$/.test(rawId)
  ) {
    throw new Error('Gemini relay returned invalid response identity');
  }
  return rawId;
}

function geminiText(body: JsonRecord): string {
  geminiResponseId(body);
  const promptFeedback = record(body.promptFeedback);
  if (
    typeof promptFeedback?.blockReason === 'string'
    && promptFeedback.blockReason
    && promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED'
  ) {
    throw new Error('Gemini relay response was blocked');
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const first = record(candidates[0]);
  const content = record(first?.content);
  if (!content || (content.role !== undefined && content.role !== 'model')) {
    throw new Error('Gemini relay returned invalid content envelope');
  }
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const textParts = parts.flatMap((entry) => {
    const block = record(entry);
    return typeof block?.text === 'string' && block.text.trim() ? [block.text.trim()] : [];
  });
  if (textParts.length === 0) throw new Error('Gemini relay response contained no text');
  return textParts.join('\n');
}

function perplexityText(body: JsonRecord): string {
  if (body.status !== 'completed') {
    throw new Error('Perplexity Agent relay returned a non-completed response');
  }
  const output = Array.isArray(body.output) ? body.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const message = record(item);
    if (message?.type !== 'message') continue;
    const content = Array.isArray(message.content) ? message.content : [];
    for (const entry of content) {
      const block = record(entry);
      if (block?.type === 'output_text' && typeof block.text === 'string' && block.text.trim()) {
        parts.push(block.text.trim());
      }
    }
  }
  if (parts.length === 0) throw new Error('Perplexity Agent relay response contained no text');
  return parts.join('\n');
}

function responseIdentity(body: JsonRecord, field: 'id' | 'responseId' = 'id'): string {
  const rawId = typeof body[field] === 'string' ? body[field].trim() : '';
  return rawId
    && rawId.length <= MAX_PROVIDER_RESPONSE_ID_LENGTH
    && /^[A-Za-z0-9._:-]+$/.test(rawId)
    ? rawId
    : 'unidentified-response';
}

function evidenceRef(provider: string, body: JsonRecord, field: 'id' | 'responseId' = 'id'): string {
  return `provider:${provider}:${responseIdentity(body, field)}`;
}

function geminiModelId(value: string): string | null {
  const normalized = value.trim().replace(/^models\//, '');
  return SAFE_GEMINI_MODEL.test(normalized) ? normalized : null;
}

function perplexityAgentModelId(value: string): string | null {
  const normalized = value.trim();
  if (normalized === 'sonar') return 'perplexity/sonar';
  return normalized.length <= 160 && SAFE_PERPLEXITY_AGENT_MODEL.test(normalized)
    ? normalized
    : null;
}

export function createServerOperatorRelayAdapters(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): OperatorRelayAdapters {
  const adapters: OperatorRelayAdapters = {};
  const geminiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  const geminiModel = env.FCR_RELAY_GEMINI_MODEL?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const openAiModel = env.FCR_RELAY_OPENAI_MODEL?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = env.FCR_RELAY_ANTHROPIC_MODEL?.trim();
  const perplexityKey = env.PERPLEXITY_API_KEY?.trim();
  const perplexityModel = env.FCR_RELAY_PERPLEXITY_MODEL?.trim();

  if (geminiKey && geminiModel) {
    const modelId = geminiModelId(geminiModel);
    if (modelId) {
      adapters.gemini = operatorRelayAdapterFromTextProvider({
        invoke: async ({ request }) => {
          ensureRelaySensitivity(request);
          ensureRelaySpendPolicy(request);
          const body = await invokeJsonProvider(
            fetchImpl,
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
            {
              method: 'POST',
              headers: {
                'x-goog-api-key': geminiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: relayPrompt(request) }] }],
                generationConfig: { maxOutputTokens: 2_000 },
              }),
              redirect: 'error',
              signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
            },
            'Gemini relay',
          );
          return { text: geminiText(body), evidenceRef: evidenceRef('gemini', body, 'responseId') };
        },
      });
    }
  }

  if (openAiKey && openAiModel) {
    adapters.codex = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        ensureRelaySpendPolicy(request);
        const body = await invokeJsonProvider(fetchImpl, 'https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: openAiModel,
            input: relayPrompt(request),
            store: false,
            max_output_tokens: 2_000,
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, 'OpenAI relay');
        return { text: openAiText(body), evidenceRef: evidenceRef('openai', body) };
      },
    });
  }

  if (anthropicKey && anthropicModel) {
    adapters['claude-code'] = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        ensureRelaySpendPolicy(request);
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
            messages: [{ role: 'user', content: relayPrompt(request) }],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, 'Anthropic relay');
        return { text: anthropicText(body), evidenceRef: evidenceRef('anthropic', body) };
      },
    });
  }

  if (perplexityKey && perplexityModel) {
    const modelId = perplexityAgentModelId(perplexityModel);
    if (modelId) {
      adapters.perplexity = operatorRelayAdapterFromTextProvider({
        invoke: async ({ request }) => {
          ensureRelaySensitivity(request);
          ensureRelaySpendPolicy(request);
          const body = await invokeJsonProvider(fetchImpl, 'https://api.perplexity.ai/v1/agent', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${perplexityKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelId,
              input: relayPrompt(request),
              tools: [{ type: 'web_search' }],
              store: false,
              max_output_tokens: 2_000,
            }),
            redirect: 'error',
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          }, 'Perplexity Agent relay');
          return { text: perplexityText(body), evidenceRef: evidenceRef('perplexity', body) };
        },
      });
    }
  }

  return adapters;
}