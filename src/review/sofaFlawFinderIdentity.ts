import { createHash } from 'node:crypto';

export const SOFA_FLAW_FINDER_IDENTITY_CONTRACT = 'juss/sofa-flaw-finder-identity@v1' as const;
export const SOFA_BASE_URL = 'https://agents.stackoverflow.com' as const;
export const SOFA_FLAW_FINDER_AGENT_NAME = 'Flaw Finder' as const;
export const SOFA_FLAW_FINDER_ROLE = 'contributor' as const;
export const SOFA_FLAW_FINDER_PUBLICATION_POLICY = 'draft_directly' as const;

const SESSION_PATH = '/api/sessions';
const OWNED_AGENTS_PATH = '/api/me/agents';
const CLIENT_NAME = 'founder-control-room';
const MODEL_NAME = 'flaw-finder-identity-preflight';
const SHA256 = /^[0-9a-f]{64}$/i;

export interface SofaOwnedAgentIdentity {
  agentId: string;
  name: string;
  description: string | null;
  role: string;
  publicationPolicy: string;
  privileges: string[];
}

export interface SofaFlawFinderIdentityReceipt {
  contract: typeof SOFA_FLAW_FINDER_IDENTITY_CONTRACT;
  provider: 'sofa';
  baseUrl: typeof SOFA_BASE_URL;
  agentId: string;
  agentName: typeof SOFA_FLAW_FINDER_AGENT_NAME;
  role: typeof SOFA_FLAW_FINDER_ROLE;
  publicationPolicy: typeof SOFA_FLAW_FINDER_PUBLICATION_POLICY;
  privileges: string[];
  descriptionDigest: string;
  observedAt: string;
  sessionExpiresAt: string;
  identityFingerprint: string;
  proposalOnly: true;
  authority: {
    externalWrite: false;
    merge: false;
    deploy: false;
    publish: false;
    providerMutation: false;
    registryPromotion: false;
  };
}

export interface SofaIdentityFetchOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort();
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalAgent(value: unknown): SofaOwnedAgentIdentity | null {
  if (!isRecord(value)) return null;
  const agentId = text(value.agent_id) || text(value.id);
  const name = text(value.name) || text(value.agent_name);
  const role = text(value.role).toLowerCase();
  const publicationPolicy = text(value.publication_policy).toLowerCase();
  if (!agentId || !name || !role || !publicationPolicy) return null;
  return {
    agentId,
    name,
    description: text(value.description) || null,
    role,
    publicationPolicy,
    privileges: normalizedStrings(value.privileges),
  };
}

export function extractSofaOwnedAgents(payload: unknown): SofaOwnedAgentIdentity[] {
  const values = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.agents)
      ? payload.agents
      : [];
  return values.map(canonicalAgent).filter((value): value is SofaOwnedAgentIdentity => value !== null);
}

function descriptionDigest(description: string | null): string {
  return digest(['sofa-agent-description@v1', description ?? null]);
}

export function sofaFlawFinderIdentityFingerprint(
  value: Omit<SofaFlawFinderIdentityReceipt, 'identityFingerprint' | 'observedAt' | 'sessionExpiresAt'>,
): string {
  return digest([
    SOFA_FLAW_FINDER_IDENTITY_CONTRACT,
    'sofa',
    value.baseUrl,
    value.agentId,
    value.agentName,
    value.role,
    value.publicationPolicy,
    [...value.privileges].sort(),
    value.descriptionDigest,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
}

export function validateSofaFlawFinderIdentityReceipt(
  receipt: SofaFlawFinderIdentityReceipt,
  nowMs = Date.now(),
): string[] {
  const errors: string[] = [];
  if (!receipt || typeof receipt !== 'object') return ['SOFA identity receipt must be an object'];
  if (receipt.contract !== SOFA_FLAW_FINDER_IDENTITY_CONTRACT) errors.push('Unsupported SOFA identity contract');
  if (receipt.provider !== 'sofa') errors.push('SOFA identity provider must be sofa');
  if (receipt.baseUrl !== SOFA_BASE_URL) errors.push('SOFA identity receipt must use the canonical base URL');
  if (!text(receipt.agentId)) errors.push('SOFA agent id is required');
  if (receipt.agentName !== SOFA_FLAW_FINDER_AGENT_NAME) errors.push('SOFA agent name must be Flaw Finder');
  if (receipt.role !== SOFA_FLAW_FINDER_ROLE) errors.push('SOFA Flaw Finder must remain contributor');
  if (receipt.publicationPolicy !== SOFA_FLAW_FINDER_PUBLICATION_POLICY) errors.push('SOFA Flaw Finder must remain draft_directly');
  if (!Array.isArray(receipt.privileges)) errors.push('SOFA privileges must be an array');
  if (!SHA256.test(receipt.descriptionDigest ?? '')) errors.push('descriptionDigest must be sha256');
  const observedAt = Date.parse(receipt.observedAt);
  const sessionExpiresAt = Date.parse(receipt.sessionExpiresAt);
  if (!Number.isFinite(observedAt)) errors.push('observedAt must be RFC3339-compatible');
  if (!Number.isFinite(sessionExpiresAt)) errors.push('sessionExpiresAt must be RFC3339-compatible');
  if (Number.isFinite(sessionExpiresAt) && sessionExpiresAt <= nowMs) errors.push('SOFA identity session is stale');
  if (Number.isFinite(observedAt) && Number.isFinite(sessionExpiresAt) && observedAt >= sessionExpiresAt) {
    errors.push('SOFA identity observation must precede session expiry');
  }
  if (receipt.proposalOnly !== true || Object.values(receipt.authority ?? {}).some(Boolean)) {
    errors.push('SOFA identity receipt cannot carry mutation or promotion authority');
  }
  if (!SHA256.test(receipt.identityFingerprint ?? '')) {
    errors.push('identityFingerprint must be sha256');
  } else if (errors.length === 0) {
    const {
      identityFingerprint: _identityFingerprint,
      observedAt: _observedAt,
      sessionExpiresAt: _sessionExpiresAt,
      ...identity
    } = receipt;
    if (receipt.identityFingerprint.toLowerCase() !== sofaFlawFinderIdentityFingerprint(identity)) {
      errors.push('identityFingerprint does not match authenticated SOFA identity');
    }
  }
  return [...new Set(errors)];
}

async function responseJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned non-JSON content`);
  }
}

export async function fetchSofaFlawFinderIdentity(
  apiKey: string,
  options: SofaIdentityFetchOptions = {},
): Promise<SofaFlawFinderIdentityReceipt> {
  const key = apiKey.trim();
  if (!key) throw new Error('SOFA_API_KEY is required');

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? SOFA_BASE_URL).replace(/\/$/, '');
  if (baseUrl !== SOFA_BASE_URL) throw new Error('SOFA identity preflight only permits the canonical provider host');
  const nowMs = options.now?.() ?? Date.now();

  const sessionResponse = await fetchImpl(`${baseUrl}${SESSION_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'X-Sofa-Client-Name': CLIENT_NAME,
      'X-Sofa-Model-Name': MODEL_NAME,
      Accept: 'application/json',
    },
  });
  const sessionPayload = await responseJson(sessionResponse, 'SOFA session creation');
  if (!isRecord(sessionPayload)) throw new Error('SOFA session response must be an object');
  const sessionId = text(sessionPayload.session_id);
  const sessionExpiresAt = text(sessionPayload.expires_at);
  if (!sessionId || !Number.isFinite(Date.parse(sessionExpiresAt))) {
    throw new Error('SOFA session response is missing session_id or expires_at');
  }
  if (Date.parse(sessionExpiresAt) <= nowMs) throw new Error('SOFA session is already expired');

  const agentsResponse = await fetchImpl(`${baseUrl}${OWNED_AGENTS_PATH}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'X-Sofa-Session': sessionId,
      'X-Sofa-Client-Name': CLIENT_NAME,
      'X-Sofa-Model-Name': MODEL_NAME,
      Accept: 'application/json',
    },
  });
  const agentsPayload = await responseJson(agentsResponse, 'SOFA owned-agent identity read');
  const matches = extractSofaOwnedAgents(agentsPayload).filter(
    (agent) => agent.name.toLowerCase() === SOFA_FLAW_FINDER_AGENT_NAME.toLowerCase(),
  );
  if (matches.length !== 1) {
    throw new Error(`SOFA identity preflight requires exactly one owned Flaw Finder agent; found ${matches.length}`);
  }

  const agent = matches[0]!;
  if (agent.role !== SOFA_FLAW_FINDER_ROLE) {
    throw new Error(`SOFA Flaw Finder role drifted: expected ${SOFA_FLAW_FINDER_ROLE}, got ${agent.role}`);
  }
  if (agent.publicationPolicy !== SOFA_FLAW_FINDER_PUBLICATION_POLICY) {
    throw new Error(
      `SOFA Flaw Finder publication policy drifted: expected ${SOFA_FLAW_FINDER_PUBLICATION_POLICY}, got ${agent.publicationPolicy}`,
    );
  }

  const observedAt = new Date(nowMs).toISOString();
  const identityBase = {
    contract: SOFA_FLAW_FINDER_IDENTITY_CONTRACT,
    provider: 'sofa' as const,
    baseUrl: SOFA_BASE_URL,
    agentId: agent.agentId,
    agentName: SOFA_FLAW_FINDER_AGENT_NAME,
    role: SOFA_FLAW_FINDER_ROLE,
    publicationPolicy: SOFA_FLAW_FINDER_PUBLICATION_POLICY,
    privileges: [...agent.privileges].sort(),
    descriptionDigest: descriptionDigest(agent.description),
    proposalOnly: true as const,
    authority: {
      externalWrite: false as const,
      merge: false as const,
      deploy: false as const,
      publish: false as const,
      providerMutation: false as const,
      registryPromotion: false as const,
    },
  };

  const receipt: SofaFlawFinderIdentityReceipt = {
    ...identityBase,
    observedAt,
    sessionExpiresAt,
    identityFingerprint: sofaFlawFinderIdentityFingerprint(identityBase),
  };
  const errors = validateSofaFlawFinderIdentityReceipt(receipt, nowMs);
  if (errors.length > 0) throw new Error(`SOFA identity receipt rejected: ${errors.join('; ')}`);
  return receipt;
}
