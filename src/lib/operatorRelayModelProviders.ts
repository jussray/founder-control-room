import type { OperatorRelayRequestV1 } from './operatorRelay.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import { operatorRelayAdapterFromTextProvider } from './operatorRelayProvider.js';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

export const OPERATOR_RELAY_PROVIDER_TIMEOUT_MS = 60_000;
export const OPERATOR_RELAY_MAX_RESPONSE_BYTES = 1_048_576;
export const OPERATOR_RELAY_MAX_ERROR_BYTES = 32_768;
const MAX_EXPOSED_PROVIDER_ERROR_CHARS = 1_024;

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

async function boundedResponseText(response: Response, label: string, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} response exceeded ${maxBytes} byte limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function redactSecrets(value: string, secrets: readonly (string | undefined)[]): string {
  let redacted = value;
  for (const secret of secrets) {
    const candidate = secret?.trim();
    if (!candidate) continue;
    redacted = redacted.split(candidate).join('[REDACTED]');
  }
  return redacted;
}

function boundedProviderError(value: string, secrets: readonly (string | undefined)[]): string {
  const redacted = redactSecrets(value, secrets).replace(/[\r\n\t]+/g, ' ').trim();
  if (redacted.length <= MAX_EXPOSED_PROVIDER_ERROR_CHARS) return redacted;
  return `${redacted.slice(0, MAX_EXPOSED_PROVIDER_ERROR_CHARS)}…`;
}

async function jsonResponse(
  response: Response,
  label: string,
  secrets: readonly (string | undefined)[] = [],
): Promise<JsonRecord> {
  const bodyText = await boundedResponseText(
    response,
    label,
    response.ok ? OPERATOR_RELAY_MAX_RESPONSE_BYTES : OPERATOR_RELAY_MAX_ERROR_BYTES,
  );
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`${label} returned non-JSON output`);
  }
  const parsed = record(body);
  if (!parsed) throw new Error(`${label} returned an invalid response object`);
  if (!response.ok) {
    const error = record(parsed.error);
    const providerMessage = typeof error?.message === 'string'
      ? error.message
      : `${label} failed with HTTP ${response.status}`;
    const message = boundedProviderError(providerMessage, secrets)
      || `${label} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
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
  const perplexityKey = env.PERPLEXITY_API_KEY?.trim();
  const perplexityModel = env.FCR_RELAY_PERPLEXITY_MODEL?.trim();

  if (openAiKey && openAiModel) {
    adapters.codex = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
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
          signal: AbortSignal.timeout(OPERATOR_RELAY_PROVIDER_TIMEOUT_MS),
        });
        const body = await jsonResponse(response, 'OpenAI relay', [openAiKey]);
        return { text: openAiText(body), evidenceRef: evidenceRef('openai', body) };
      },
    });
  }

  if (anthropicKey && anthropicModel) {
    adapters['claude-code'] = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 2_000,
            messages: [{ role: 'user', content: relayPrompt(request) }],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(OPERATOR_RELAY_PROVIDER_TIMEOUT_MS),
        });
        const body = await jsonResponse(response, 'Anthropic relay', [anthropicKey]);
        return { text: anthropicText(body), evidenceRef: evidenceRef('anthropic', body) };
      },
    });
  }

  if (perplexityKey && perplexityModel) {
    adapters.perplexity = operatorRelayAdapterFromTextProvider({
      invoke: async ({ request }) => {
        ensureRelaySensitivity(request);
        const response = await fetchImpl('https://api.perplexity.ai/v1/sonar', {
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
          signal: AbortSignal.timeout(OPERATOR_RELAY_PROVIDER_TIMEOUT_MS),
        });
        const body = await jsonResponse(response, 'Perplexity relay', [perplexityKey]);
        return { text: perplexityText(body), evidenceRef: evidenceRef('perplexity', body) };
      },
    });
  }

  return adapters;
}
