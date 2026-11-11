import {
  buildFirstPartySocialPostInput,
  classifyRepositoryForContent,
  type CampaignClassification,
  type DraftMaterial,
  type RepositoryEvidence,
} from './socialCampaignPolicy.js';
import type {
  FirstPartySocialPlatform,
  FirstPartySocialPostInput,
  SocialMediaAsset,
} from './firstPartySocialPublisher.js';
import {
  auditForDuplicatePost,
  type DuplicatePostAuditResult,
  type PriorPostSummary,
} from './founderContentDuplicateAudit.js';

/**
 * Generates the caller-supplied `DraftMaterial` that `socialCampaignPolicy.ts`
 * has always accepted from outside its own boundary. This module is the first
 * concrete generation step authorized for the content-autopilot pipeline: it
 * calls Perplexity, then immediately hands the result to the existing
 * classification + output-firewall gate before returning anything. It never
 * publishes, schedules, or talks to Buffer — those remain separately gated
 * downstream (`founderContentLifecycle.ts`, the n8n founder-content
 * orchestrators, and the founder's own per-post approval).
 */

export const PERPLEXITY_CONTENT_GENERATION_CONTRACT = 'fcr/perplexity-content-generation@v1' as const;

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 60_000;
const DEFAULT_MODEL = 'sonar';
const SAFE_MODEL_ID = /^(?:sonar(?:-[a-z]+)?|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)$/;
const MAX_FIELD_LENGTH = 4_000;
const REQUIRED_DRAFT_FIELDS = ['text', 'traction', 'governanceAdvantage', 'audienceValue', 'investorSignal'] as const;

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;
type RequiredDraftField = (typeof REQUIRED_DRAFT_FIELDS)[number];

export class PerplexityContentGenerationError extends Error {
  readonly code = 'PERPLEXITY_CONTENT_GENERATION_REJECTED';
}

export interface GeneratePerplexityDraftInput {
  evidence: RepositoryEvidence;
  platform: FirstPartySocialPlatform;
  accountId: string;
  platformCharacterLimit?: number | null;
  media?: SocialMediaAsset[];
  /**
   * Prior drafted/posted items to audit the new candidate against, so the
   * same progress never goes out twice under different wording. Caller
   * supplied — this module has no database access of its own. Omit or pass
   * an empty array to skip the audit (e.g. when the caller has no history
   * to check yet); duplication is only ever checked when history is given.
   */
  priorPosts?: readonly PriorPostSummary[];
  duplicateSimilarityThreshold?: number;
}

export interface PerplexityContentGeneratorOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

export interface GeneratedPerplexityDraft {
  classification: CampaignClassification;
  postInput: FirstPartySocialPostInput;
  duplicateAudit: DuplicatePostAuditResult;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function modelId(value: string): string | null {
  const normalized = value.trim();
  return normalized && SAFE_MODEL_ID.test(normalized) ? normalized : null;
}

function rejected(message: string): never {
  throw new PerplexityContentGenerationError(`${PERPLEXITY_CONTENT_GENERATION_CONTRACT}: ${message}`);
}

async function boundedResponseText(response: Response, label: string): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
      try {
        await response.body?.cancel();
      } catch {
        // The size receipt remains valid even if an already-closed stream cannot be cancelled.
      }
      rejected(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
    }
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        rejected(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function perplexityResponseBody(response: Response): Promise<JsonRecord> {
  const label = 'Perplexity content-generation request';
  if (!response.ok) {
    // Provider error bodies are untrusted, can be arbitrarily large, and can
    // echo submitted context — status alone is sufficient for the receipt.
    try {
      await response.body?.cancel();
    } catch {
      // Failure to cancel an already-closed body does not change provider truth.
    }
    rejected(`${label} failed with HTTP ${response.status}`);
  }

  const raw = await boundedResponseText(response, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    rejected(`${label} returned non-JSON output`);
  }
  const body = record(parsed);
  if (!body) rejected(`${label} returned an invalid response object`);
  return body;
}

function perplexityOutputText(body: JsonRecord): string {
  if (body.status !== 'completed') {
    rejected('Perplexity content-generation response was not completed');
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
  if (parts.length === 0) rejected('Perplexity content-generation response contained no text');
  return parts.join('\n');
}

function extractJsonObject(raw: string): JsonRecord {
  const direct = (() => {
    try {
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
  })();
  if (record(direct)) return direct as JsonRecord;

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (record(parsed)) return parsed as JsonRecord;
    } catch {
      // fall through to rejection below
    }
  }

  return rejected('Perplexity content-generation output was not a single JSON object');
}

function requiredField(fields: JsonRecord, field: RequiredDraftField): string {
  const value = text(fields[field]);
  if (!value) rejected(`Perplexity content-generation output is missing "${field}"`);
  if (value.length > MAX_FIELD_LENGTH) rejected(`Perplexity content-generation "${field}" exceeds ${MAX_FIELD_LENGTH} characters`);
  return value;
}

function parseGeneratedFields(raw: string): Record<RequiredDraftField, string> {
  const fields = extractJsonObject(raw);
  const unknownKeys = Object.keys(fields).filter(
    (key) => !REQUIRED_DRAFT_FIELDS.includes(key as RequiredDraftField),
  );
  if (unknownKeys.length > 0) {
    rejected(`Perplexity content-generation output contained unexpected fields: ${unknownKeys.join(', ')}`);
  }

  return {
    text: requiredField(fields, 'text'),
    traction: requiredField(fields, 'traction'),
    governanceAdvantage: requiredField(fields, 'governanceAdvantage'),
    audienceValue: requiredField(fields, 'audienceValue'),
    investorSignal: requiredField(fields, 'investorSignal'),
  };
}

function buildContentPrompt(
  evidence: RepositoryEvidence,
  classificationResult: CampaignClassification,
  approvedProofUrl: string,
): string {
  return [
    'You are drafting a short, honest progress update about a software repository for its founder to review.',
    'Use only the verified facts given below. Never invent metrics, users, revenue, launches, certifications, or capabilities.',
    'Never include credentials, tokens, secrets, private file paths, internal infrastructure detail, or implementation recipes.',
    '',
    `Repository: ${evidence.fullName}`,
    `Verified exact commit: ${evidence.exactHead}`,
    `Recent commit count: ${evidence.recentCommitCount}`,
    `Recent merged pull requests: ${evidence.recentMergedPullRequests}`,
    `Classification: ${classificationResult.mode} — ${classificationResult.reason}`,
    `Approved public proof URL (include this exact URL once in "text"): ${approvedProofUrl}`,
    '',
    'Write for a mixed audience in the same post: customers, prospective partners, and investors are all',
    'reading this at once. Do not write an investor-only or customer-only post — make the value legible to all three.',
    '',
    'Respond with ONLY a single JSON object and no other text, markdown, or commentary.',
    'The object must have exactly these five string keys and no others:',
    '"text" (the full post body, honest and specific, including the approved proof URL once, written for customers, partners, and investors together),',
    '"traction" (one concrete, verifiable thing that shipped),',
    '"governanceAdvantage" (why the verification/approval process behind this is itself a differentiator),',
    '"audienceValue" (why this matters to a customer deciding whether to rely on this product, AND to a prospective partner evaluating whether to integrate or collaborate — address both explicitly),',
    '"investorSignal" (what this demonstrates to an investor about shipping cadence or discipline).',
  ].join('\n');
}

/**
 * Calls Perplexity to draft social copy for one already-classified,
 * already-eligible repository, then immediately runs the result through
 * the existing `socialCampaignPolicy.ts` output firewall before returning.
 *
 * Returns a `FirstPartySocialPostInput` that is structurally always
 * `mode: 'draft'`, `publishAllowed: false`, `founderApprovalId: null` — the
 * same guarantee `buildFirstPartySocialPostInput` already provides. This
 * function cannot publish, schedule, or acquire founder approval; it only
 * produces a draft for a human to review.
 */
export async function generatePerplexityDraftMaterial(
  input: GeneratePerplexityDraftInput,
  options: PerplexityContentGeneratorOptions = {},
): Promise<GeneratedPerplexityDraft> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  const classificationResult = classifyRepositoryForContent(input.evidence);
  if (!classificationResult.eligibleForDraftGeneration) {
    rejected(
      `${input.evidence.fullName} is not eligible for draft generation: ${classificationResult.reason}`,
    );
  }

  const apiKey = text(env.PERPLEXITY_API_KEY);
  if (!apiKey) rejected('PERPLEXITY_API_KEY is not configured');

  // A separate, explicit opt-in from the shared relay API key. A key
  // provisioned for an unrelated capability (e.g. peer review) must never
  // silently enable content generation / provider spend for this pipeline.
  if (text(env.PERPLEXITY_CONTENT_GENERATION_ENABLED).toLowerCase() !== 'true') {
    rejected(
      'content generation is disabled; set PERPLEXITY_CONTENT_GENERATION_ENABLED=true to enable it. ' +
        'This is a one-time build/runtime opt-in, not a standing publish grant — every resulting draft ' +
        'still requires separate founder approval before anything downstream may publish or schedule it.',
    );
  }

  const approvedProofUrl = input.evidence.policy.publicProofUrls[0];
  if (!approvedProofUrl) {
    rejected(`${input.evidence.fullName} has no approved public proof URL to cite.`);
  }

  const resolvedModel = modelId(text(env.FCR_PERPLEXITY_CONTENT_MODEL) || DEFAULT_MODEL);
  if (!resolvedModel) rejected('configured Perplexity content-generation model id is invalid');

  const prompt = buildContentPrompt(input.evidence, classificationResult, approvedProofUrl);

  let response: Response;
  try {
    response = await fetchImpl('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        input: prompt,
        store: false,
        max_output_tokens: 800,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Do not serialize the transport exception: it can carry request
    // metadata, proxies, or secret-bearing diagnostics.
    rejected('Perplexity content-generation request failed');
  }

  const body = await perplexityResponseBody(response);
  const rawText = perplexityOutputText(body);
  const fields = parseGeneratedFields(rawText);

  const postText = fields.text.includes(approvedProofUrl)
    ? fields.text
    : `${fields.text}\n\n${approvedProofUrl}`;

  const draft: DraftMaterial = {
    platform: input.platform,
    accountId: input.accountId,
    text: postText,
    traction: fields.traction,
    governanceAdvantage: fields.governanceAdvantage,
    audienceValue: fields.audienceValue,
    investorSignal: fields.investorSignal,
    proofLinks: [{ label: `${input.evidence.fullName} proof`, url: approvedProofUrl }],
    media: input.media,
    platformCharacterLimit: input.platformCharacterLimit ?? null,
  };

  const postInput = buildFirstPartySocialPostInput(classificationResult, input.evidence, draft);

  const duplicateAudit = auditForDuplicatePost(postInput.text, input.priorPosts ?? [], {
    similarityThreshold: input.duplicateSimilarityThreshold,
  });
  if (duplicateAudit.isDuplicate) {
    rejected(`generated draft duplicates prior content: ${duplicateAudit.reason}`);
  }

  return { classification: classificationResult, postInput, duplicateAudit };
}
