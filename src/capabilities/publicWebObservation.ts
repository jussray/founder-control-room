import { createHash } from 'node:crypto';
import { McpHub } from '../mcp/hub.js';
import type { McpToolDefinition } from '../mcp/types.js';
import type { Capability } from './workbenchRegistry.js';

export const PUBLIC_WEB_OBSERVATION_CAPABILITY_ID = 'public-web-observation-v1';
const OBSERVATION_SERVER_ID = 'exa';
const MAX_QUERY_LENGTH = 2_048;
const MAX_FETCH_URLS = 10;

export type PublicWebObservationErrorCode =
  | 'public_web_invalid_request'
  | 'public_web_unavailable'
  | 'public_web_upstream_failure';

export class PublicWebObservationError extends Error {
  constructor(
    public readonly code: PublicWebObservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicWebObservationError';
  }
}

export interface PublicWebContinuityInput {
  priorEvidenceFingerprint?: string | null;
  priorProofCookie?: string | null;
}

export interface PublicWebObservationReceipt<T = unknown> {
  contract: 'fcr/public-web-observation@v1';
  provider: 'fcr-research-hub';
  adapterId: string;
  operation: 'search' | 'fetch';
  authority: 'read_only';
  consequence: 'READ';
  mutationAllowed: false;
  providerAccepted: true;
  truthState: 'provider_observed_unverified';
  contentTrust: 'untrusted_web';
  observedAt: string;
  requestFingerprint: string;
  sourceUrls: string[];
  resultCount: number;
  data: T;
  continuity: {
    predecessorFingerprint: string | null;
    predecessorProofCookie: string | null;
    evidenceFingerprint: string;
    proofCookie: string;
    transition: 'initial' | 'confirmed' | 'changed';
    authorityEffect: 'none';
  };
}

type HubLike = Pick<McpHub, 'discoverCapabilities' | 'invoke'>;

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function proofCookieFor(evidenceFingerprint: string): string {
  return `fcr-public-web:v1:${evidenceFingerprint.replace(/^sha256:/, '').slice(0, 32)}`;
}

function normalizeContinuityValue(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 256) : null;
}

function continuityReceipt(
  evidenceFingerprint: string,
  continuity: PublicWebContinuityInput = {},
): PublicWebObservationReceipt['continuity'] {
  const predecessorFingerprint = normalizeContinuityValue(continuity.priorEvidenceFingerprint);
  const predecessorProofCookie = normalizeContinuityValue(continuity.priorProofCookie);
  const proofCookie = proofCookieFor(evidenceFingerprint);
  const hasPredecessor = predecessorFingerprint !== null || predecessorProofCookie !== null;
  const transition = !hasPredecessor
    ? 'initial'
    : predecessorFingerprint === evidenceFingerprint && predecessorProofCookie === proofCookie
      ? 'confirmed'
      : 'changed';

  return {
    predecessorFingerprint,
    predecessorProofCookie,
    evidenceFingerprint,
    proofCookie,
    transition,
    authorityEffect: 'none',
  };
}

function schemaProperties(tool: McpToolDefinition): Record<string, unknown> {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== 'object') return {};
  const properties = schema.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {};
}

function setFirstSupported(
  args: Record<string, unknown>,
  properties: Record<string, unknown>,
  names: readonly string[],
  value: unknown,
): boolean {
  const key = names.find((name) => Object.hasOwn(properties, name));
  if (!key) return false;
  args[key] = value;
  return true;
}

function findTool(
  tools: readonly McpToolDefinition[],
  preferred: readonly string[],
): McpToolDefinition | undefined {
  for (const name of preferred) {
    const exact = tools.find((tool) => tool.name === name);
    if (exact) return exact;
    const namespaced = tools.find(
      (tool) => tool.name.endsWith(`_${name}`) || tool.name.endsWith(`.${name}`),
    );
    if (namespaced) return namespaced;
  }
  return undefined;
}

function extractUrls(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    if (!/^https?:\/\//i.test(value.trim())) return [];
    try {
      return [new URL(value.trim()).toString()];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap((item) => extractUrls(item, depth + 1));
  if (typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>)
    .flatMap((item) => extractUrls(item, depth + 1));
}

function validatePublicUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PublicWebObservationError(
      'public_web_invalid_request',
      'Fetch URLs must be absolute public HTTP(S) URLs.',
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new PublicWebObservationError(
      'public_web_invalid_request',
      'Fetch URLs must use HTTP or HTTPS.',
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new PublicWebObservationError(
      'public_web_invalid_request',
      'Fetch refuses local or obviously private-network targets.',
    );
  }
  return parsed.toString();
}

function searchArguments(tool: McpToolDefinition, query: string): Record<string, unknown> {
  const properties = schemaProperties(tool);
  const args: Record<string, unknown> = {};
  if (!setFirstSupported(args, properties, ['query', 'q', 'search_query', 'searchQuery'], query)) {
    args.query = query;
  }
  setFirstSupported(args, properties, ['num_results', 'numResults', 'limit', 'per_page', 'perPage'], 10);
  setFirstSupported(args, properties, ['include_text', 'includeText'], true);
  return args;
}

function fetchArguments(tool: McpToolDefinition, urls: string[]): Record<string, unknown> {
  const properties = schemaProperties(tool);
  const args: Record<string, unknown> = {};
  if (urls.length === 1 && setFirstSupported(args, properties, ['url', 'uri'], urls[0])) return args;
  if (setFirstSupported(args, properties, ['urls', 'uris'], urls)) return args;
  if (urls.length === 1) {
    args.url = urls[0];
    return args;
  }
  throw new PublicWebObservationError(
    'public_web_unavailable',
    'Current governed fetch adapter does not expose bounded multi-URL fetch.',
  );
}

export async function observePublicWeb(
  input: {
    operation: 'search' | 'fetch';
    query?: string;
    urls?: string[];
    continuity?: PublicWebContinuityInput;
  },
  hub: HubLike = new McpHub(),
): Promise<PublicWebObservationReceipt> {
  const capabilities = await hub.discoverCapabilities(OBSERVATION_SERVER_ID, 'founder-control-room');
  const tool = input.operation === 'search'
    ? findTool(capabilities.tools, ['deep_search_exa', 'web_search_advanced_exa', 'web_search_exa'])
    : findTool(capabilities.tools, ['web_fetch_exa']);

  if (!tool) {
    throw new PublicWebObservationError(
      'public_web_unavailable',
      `No governed ${input.operation} adapter is available.`,
    );
  }

  let args: Record<string, unknown>;
  if (input.operation === 'search') {
    const query = input.query?.trim() ?? '';
    if (!query || query.length > MAX_QUERY_LENGTH) {
      throw new PublicWebObservationError(
        'public_web_invalid_request',
        `Search query must contain 1-${MAX_QUERY_LENGTH} characters.`,
      );
    }
    args = searchArguments(tool, query);
  } else {
    const urls = (input.urls ?? []).map(validatePublicUrl);
    if (urls.length < 1 || urls.length > MAX_FETCH_URLS) {
      throw new PublicWebObservationError(
        'public_web_invalid_request',
        `Fetch requires between 1 and ${MAX_FETCH_URLS} public URLs.`,
      );
    }
    args = fetchArguments(tool, urls);
  }

  let invocation;
  try {
    invocation = await hub.invoke({
      serverId: OBSERVATION_SERVER_ID,
      projectId: 'founder-control-room',
      toolName: tool.name,
      arguments: args,
    });
  } catch {
    throw new PublicWebObservationError(
      'public_web_upstream_failure',
      'Governed public-web observation failed.',
    );
  }

  if (invocation.policy.decision !== 'allow' || invocation.policy.risk !== 'read') {
    throw new PublicWebObservationError(
      'public_web_upstream_failure',
      'Governed public-web observation did not return a read-only policy result.',
    );
  }

  const sourceUrls = [...new Set(extractUrls(invocation.result))].slice(0, 100);
  const data = {
    toolName: tool.name,
    policy: {
      decision: invocation.policy.decision,
      risk: invocation.policy.risk,
    },
    result: invocation.result,
  };
  const requestFingerprint = sha256({
    capability: PUBLIC_WEB_OBSERVATION_CAPABILITY_ID,
    operation: input.operation,
    args,
  });
  const evidenceFingerprint = sha256({
    capability: PUBLIC_WEB_OBSERVATION_CAPABILITY_ID,
    operation: input.operation,
    sourceUrls,
    result: invocation.result,
  });

  return {
    contract: 'fcr/public-web-observation@v1',
    provider: 'fcr-research-hub',
    adapterId: OBSERVATION_SERVER_ID,
    operation: input.operation,
    authority: 'read_only',
    consequence: 'READ',
    mutationAllowed: false,
    providerAccepted: true,
    truthState: 'provider_observed_unverified',
    contentTrust: 'untrusted_web',
    observedAt: new Date().toISOString(),
    requestFingerprint,
    sourceUrls,
    resultCount: sourceUrls.length,
    data,
    continuity: continuityReceipt(evidenceFingerprint, input.continuity),
  };
}

export const PUBLIC_WEB_OBSERVATION_CAPABILITY: Capability = {
  id: PUBLIC_WEB_OBSERVATION_CAPABILITY_ID,
  kind: 'Automation',
  category: 'integrations',
  score: 97,
  runtime: 'dynamic',
  summary: 'Search or fetch public-web evidence through Founder Control Room’s governed read-only research hub.',
  purpose: 'Keep public-web observation owned by FCR: provider-neutral product contract, bounded adapters, source URLs, fingerprints, continuity metadata, and no mutation authority.',
  inputs: [
    ['operation', 'enum', 'search | fetch'],
    ['query', 'string', 'Required for search; founder-bounded public-web query'],
    ['urls', 'http(s) URL[]', 'Required for fetch; 1-10 public targets'],
    ['priorEvidenceFingerprint', 'fingerprint', 'Optional predecessor evidence marker'],
    ['priorProofCookie', 'non-secret marker', 'Optional predecessor continuity marker; never authority'],
  ],
  environment: [
    'FCR MCP Hub owns adapter policy and tool allowlists',
    'The capability contract is provider-neutral',
    'No provider-specific secret belongs to this capability',
    'Returned web content remains untrusted input',
  ],
  proof: [
    'Founder authentication is required before execution',
    'The MCP Hub must return policy decision=allow and risk=read',
    'Every successful observation emits request/evidence fingerprints and observed source URLs',
    'Continuity can be initial, confirmed, or changed but never grants authority',
    'Receipt pins authority=read_only, consequence=READ, mutationAllowed=false, and authorityEffect=none',
  ],
  risk: 'Read-only observation only. External content is untrusted evidence and cannot authorize merge, deploy, publication, spend, or provider mutation. Search/fetch adapters remain replaceable behind FCR’s governed hub.',
  implementation: 'POST /capabilities/public-web-observation-v1/runs with { operation, query | urls, priorEvidenceFingerprint?, priorProofCookie? }. FCR resolves the current read-only research adapter through its own MCP Hub.',
};
