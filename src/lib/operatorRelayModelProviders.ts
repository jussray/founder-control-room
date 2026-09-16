import type { OperatorRelayRequestV1 } from './operatorRelay.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import { operatorRelayAdapterFromTextProvider } from './operatorRelayProvider.js';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

export const OPERATOR_RELAY_PROVIDER_TIMEOUT_MS = 60_000;
export const OPERATOR_RELAY_MAX_RESPONSE_BYTES = 512 * 1024;
export const OPERATOR_RELAY_MAX_ERROR_CHARS = 1_000;

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

function redactSecrets(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    const exact = secret.trim();
    if (exact) redacted = redacted.split(exact).join('[REDACTED]');
  }
  return redacted
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\bpplx-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
}

function safeProviderErrorMessage(
  parsed: JsonRecord,
  label: string,
  status: number,
  secrets: readonly string[],
): string {
  const error = record(parsed.error);
  const candidate = typeof error?.message === 'string'
    ? error.message
    : typeof parsed.error === 'string'
      ? parsed.error
      : `${label} failed with HTTP ${status}`;
  const normalized = redactSecrets(candidate.replace(/[\r\n\t]+/g, ' ').trim(), secrets)
    .slice(0, OPERATOR_RELAY_MAX_ERROR_CHARS);
  return normalized || `${label} failed with HTTP ${status}`;
}

async function readBoundedResponseText(response: Response, label: string): Promise<string> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > OPERATOR_RELAY_MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeded the bounded response size`);
  }

  if (!response.body) {
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > OPERATOR_RELAY_MAX_RESPONSE_BYTES) {
      throw new Error(`${label} response exceeded the bounded response size`);
    }
    return raw;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > OPERATOR_RELAY_MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${label} response exceeded the bounded response size`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
}

async function jsonResponse(
  response: Response,
  label: string,
  secrets: readonly string[] = [],
): Promise<JsonRecord> {
  let raw: string;
  try {
    raw = await readBoundedResponseText(response, label);
  } catch (error) {
    if (error instanceof Error && error.message.includes('bounded response size')) throw error;
    throw new Error(`${label} response body could not be read`);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned non-JSON output`);
  }

  const parsed = record(body);
  if (!parsed) throw new Error(`${label} returned an invalid response object`);
  if (!response.ok) {
    throw new Error(safeProviderErrorMessage(parsed, label, response.status, secrets));
  }
  return parsed;
}

async function fetchProviderJson(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
  label: string,
  secrets: readonly string[],
): Promise<JsonRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPERATOR_RELAY_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    return await jsonResponse(response, label, secrets);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${OPERATOR_RELAY_PROVIDER_TIMEOUT_MS}ms`);
    }
    if (error instanceof Error) {
      throw new Error(redactSecrets(error.message, secrets).slice(0, OPERATOR_RELAY_MAX_ERROR_CHARS));
    }
    throw new Error(`${label} failed without a safe error receipt`);
  } finally {
    clearTimeout(timer);
  }
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

function perplexityText(body: JsonRecord): string {
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = record(choices[0]);
  const message = record(first?.message);
  if (typeof message?.content !== 'string' || !message.content.trim()) {
    throw new Error('Perplexity relay response contained no text');
  }
  return message.content.trim();
}

function evidenceRef(provider: string, body: JsonRecord): string {
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : 'unidentified-response';
  return `provider:${provider}:${id}`;
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
  const anthropicWorkspaceId = env.FCR_RELAY_ANTHROPIC_WORKSPACE_ID?.trim();
  const perplexityKey = env.PERPLEXITY_API_KEY?.trim();
  const perplexityModel = env.FCR_RELAY_PERPLEXITY_MODEL?.trim();

  if (openAiKey && openAiModel) {
    adapters.codex = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const body = await fetchProviderJson(fetchImpl, 'https://api.openai.com/v1/responses', {
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
        }, 'OpenAI relay', [openAiKey]);
        return { text: openAiText(body), evidenceRef: evidenceRef('openai', body) };
      },
    });
  }

  if (anthropicKey && anthropicModel) {
    adapters['claude-code'] = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const headers: Record<string, string> = {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        };
        if (anthropicWorkspaceId) headers['anthropic-workspace-id'] = anthropicWorkspaceId;

        const body = await fetchProviderJson(fetchImpl, 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 2_000,
            messages: [{ role: 'user', content: relayPrompt(request) }],
          }),
          redirect: 'error',
        }, 'Anthropic relay', [anthropicKey]);
        return { text: anthropicText(body), evidenceRef: evidenceRef('anthropic', body) };
      },
    });
  }

  if (perplexityKey && perplexityModel) {
    adapters.perplexity = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const body = await fetchProviderJson(fetchImpl, 'https://api.perplexity.ai/v1/sonar', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: perplexityModel,
            messages: [{ role: 'user', content: relayPrompt(request) }],
          }),
          redirect: 'error',
        }, 'Perplexity relay', [perplexityKey]);
        return { text: perplexityText(body), evidenceRef: evidenceRef('perplexity', body) };
      },
    });
  }

  return adapters;
}
