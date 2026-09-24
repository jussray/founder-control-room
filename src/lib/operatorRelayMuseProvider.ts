import type { OperatorRelayRequestV1 } from './operatorRelay.js';
import type { OperatorRelayAdapter } from './operatorRelayDispatch.js';
import { operatorRelayAdapterFromTextProvider } from './operatorRelayProvider.js';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

const MUSE_RESPONSES_URL = 'https://api.meta.ai/v1/responses';
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 60_000;
const MAX_PROVIDER_RESPONSE_ID_LENGTH = 200;
const SAFE_MUSE_MODEL = /^muse-spark-1\.(?:1|2|3)$/;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function relayPrompt(request: OperatorRelayRequestV1): string {
  return [
    'You are Muse responding through Founder Control Room as a bounded Founder AI Council peer.',
    'Act as an independent truth challenger: surface contradictions, provider/runtime drift, unsupported claims, and better alternatives.',
    'Do not claim founder approval, mutation authority, merge/deploy/publish authority, credentials, or tool authority.',
    `Requested capability: ${request.capability}`,
    `Goal: ${request.goal}`,
    'Context:',
    request.context.summary,
    'Return the useful answer only. State material uncertainty explicitly.',
  ].join('\n\n');
}

function ensureRelayPolicy(request: OperatorRelayRequestV1): void {
  if (request.sensitivity === 'restricted') {
    throw new Error('restricted relay context requires a separately approved provider data policy');
  }
  if (request.capability === 'review') {
    throw new Error('semantic peer review is paused by founder cost-control policy');
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PROVIDER_RESPONSE_BYTES) {
      try {
        await response.body?.cancel();
      } catch {
        // The size receipt remains valid even if an already-closed stream cannot be cancelled.
      }
      throw new Error(`Muse relay response exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
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
        throw new Error(`Muse relay response exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function invokeMuse(
  fetchImpl: FetchLike,
  apiKey: string,
  model: string,
  request: OperatorRelayRequestV1,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetchImpl(MUSE_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: relayPrompt(request),
        store: false,
        max_output_tokens: 2_000,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Muse relay request failed');
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Provider error bodies are intentionally not promoted into FCR errors.
    }
    throw new Error(`Muse relay failed with HTTP ${response.status}`);
  }

  const text = await boundedResponseText(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Muse relay returned non-JSON output');
  }
  const body = record(parsed);
  if (!body) throw new Error('Muse relay returned an invalid response object');
  return body;
}

function responseIdentity(body: JsonRecord): string {
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (
    !id
    || id.length > MAX_PROVIDER_RESPONSE_ID_LENGTH
    || !/^[A-Za-z0-9._:-]+$/.test(id)
  ) {
    throw new Error('Muse relay returned invalid response identity');
  }
  return id;
}

function museText(body: JsonRecord): string {
  if (body.status !== 'completed') {
    throw new Error('Muse relay returned a non-completed response');
  }
  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
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
  if (parts.length === 0) throw new Error('Muse relay response contained no text');
  return parts.join('\n');
}

function museModelId(value: string): string | null {
  const normalized = value.trim();
  return SAFE_MUSE_MODEL.test(normalized) ? normalized : null;
}

export function createServerMuseRelayAdapter(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): OperatorRelayAdapter | undefined {
  const apiKey = env.MODEL_API_KEY?.trim();
  const configuredModel = env.FCR_RELAY_MUSE_MODEL?.trim();
  if (!apiKey || !configuredModel) return undefined;

  const model = museModelId(configuredModel);
  if (!model) return undefined;

  return operatorRelayAdapterFromTextProvider({
    invoke: async ({ request }) => {
      ensureRelayPolicy(request);
      const body = await invokeMuse(fetchImpl, apiKey, model, request);
      return {
        text: museText(body),
        evidenceRef: `provider:meta:${responseIdentity(body)}`,
      };
    },
  });
}
