import { createHash } from 'node:crypto';

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

export const COURT_WITNESS_BRIDGE_CONTRACT = 'fcr/court-witness-bridge@v1' as const;

export type CourtWitnessBridgeCode =
  | 'COMPLETE'
  | 'BRIDGE_DISABLED'
  | 'BRIDGE_NOT_CONFIGURED'
  | 'INVALID_PACKET'
  | 'KODY_UNREACHABLE'
  | 'KODY_REJECTED'
  | 'KODY_RECEIPT_INVALID'
  | 'SOL_UNREACHABLE'
  | 'SOL_REJECTED'
  | 'SOL_RECEIPT_INVALID'
  | 'PROMPTOS_UNREACHABLE'
  | 'PROMPTOS_REJECTED'
  | 'PROMPTOS_RECEIPT_INVALID';

export interface CourtWitnessBridgeSubject {
  caseId: string;
  repository: string;
  branch: string;
  headSha: string;
}

export interface CourtWitnessBridgeResult {
  ok: boolean;
  code: CourtWitnessBridgeCode;
  status: number;
  contract: typeof COURT_WITNESS_BRIDGE_CONTRACT;
  subject: CourtWitnessBridgeSubject | null;
  kody: JsonRecord | null;
  sol: JsonRecord | null;
  promptos: JsonRecord | null;
  reasons: string[];
}

interface BridgeConfig {
  enabled: boolean;
  kodyUrl: string | null;
  solUrl: string | null;
  solToken: string | null;
  promptosUrl: string | null;
  promptosToken: string | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

const EXACT_ZERO_AUTHORITY = Object.freeze({
  evidenceOnly: true,
  createsTruth: false,
  createsAuthority: false,
  executionAuthorized: false,
  mergeAuthorized: false,
  deployAuthorized: false,
  publishAuthorized: false,
  credentialMutationAuthorized: false,
  providerMutationAuthorized: false,
});

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string, max = 4_000): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim().slice(0, max);
}

function fullSha(value: unknown, label: string): string {
  const normalized = text(value, label, 40).toLowerCase();
  if (!FULL_SHA.test(normalized)) throw new Error(`${label} must be a full git SHA`);
  return normalized;
}

function hash(value: unknown, label: string): string {
  const normalized = text(value, label, 64).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`${label} must be SHA-256`);
  return normalized;
}

function exactAuthority(value: unknown, label: string): typeof EXACT_ZERO_AUTHORITY {
  const authority = record(value, label);
  for (const [key, expected] of Object.entries(EXACT_ZERO_AUTHORITY)) {
    if (authority[key] !== expected) {
      throw new Error(`${label}.${key} widened or missing`);
    }
  }
  return EXACT_ZERO_AUTHORITY;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function verifyBoundFingerprint(value: unknown, field: string, label: string): string {
  const item = record(value, label);
  const claimed = hash(item[field], `${label}.${field}`);
  const core = { ...item };
  delete core[field];
  if (stableHash(core) !== claimed) throw new Error(`${label} fingerprint mismatch`);
  return claimed;
}

function safeHttpsUrl(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  url.hash = '';
  return url.toString();
}

export function readCourtWitnessBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return {
    enabled: env.FCR_COURT_WITNESS_BRIDGE_ENABLED?.trim() === '1',
    kodyUrl: safeHttpsUrl(env.FCR_KODY_COURT_WITNESS_URL, 'FCR_KODY_COURT_WITNESS_URL'),
    solUrl: safeHttpsUrl(env.SOLCONTINUITY_COURT_URL, 'SOLCONTINUITY_COURT_URL'),
    solToken: env.SOLCONTINUITY_COURT_BRIDGE_TOKEN?.trim() || null,
    promptosUrl: safeHttpsUrl(env.PROMPTOS_COURT_URL, 'PROMPTOS_COURT_URL'),
    promptosToken: env.PROMPTOS_COURT_BRIDGE_KEY?.trim() || null,
  };
}

export interface CourtWitnessBridgeReadiness {
  enabled: boolean;
  ready: boolean;
  missingBindings: string[];
  reasons: string[];
}

export function courtWitnessBridgeReadiness(
  env: NodeJS.ProcessEnv = process.env,
): CourtWitnessBridgeReadiness {
  const enabled = env.FCR_COURT_WITNESS_BRIDGE_ENABLED?.trim() === '1';
  if (!enabled) {
    return {
      enabled: false,
      ready: false,
      missingBindings: [],
      reasons: ['FCR Court witness bridge is disabled'],
    };
  }

  let config: BridgeConfig;
  try {
    config = readCourtWitnessBridgeConfig(env);
  } catch (error) {
    return {
      enabled: true,
      ready: false,
      missingBindings: [],
      reasons: [
        error instanceof Error
          ? error.message
          : 'Court witness bridge configuration is invalid',
      ],
    };
  }

  const missingBindings = [
    !config.kodyUrl && 'FCR_KODY_COURT_WITNESS_URL',
    !config.solUrl && 'SOLCONTINUITY_COURT_URL',
    !config.solToken && 'SOLCONTINUITY_COURT_BRIDGE_TOKEN',
    !config.promptosUrl && 'PROMPTOS_COURT_URL',
    !config.promptosToken && 'PROMPTOS_COURT_BRIDGE_KEY',
  ].filter(Boolean) as string[];

  return {
    enabled: true,
    ready: missingBindings.length === 0,
    missingBindings,
    reasons: missingBindings.length === 0
      ? []
      : [`Court witness bridge requires: ${missingBindings.join(', ')}`],
  };
}

function packetSubject(packet: unknown): CourtWitnessBridgeSubject {
  const input = record(packet, 'packet');
  return {
    caseId: text(input.caseId, 'packet.caseId', 160),
    repository: text(input.repository, 'packet.repository', 300),
    branch: text(input.branch, 'packet.branch', 200),
    headSha: fullSha(input.headSha, 'packet.headSha'),
  };
}

function failure(
  code: CourtWitnessBridgeCode,
  status: number,
  subject: CourtWitnessBridgeResult['subject'],
  reasons: string[],
  partial: Pick<CourtWitnessBridgeResult, 'kody' | 'sol' | 'promptos'> = {
    kody: null,
    sol: null,
    promptos: null,
  },
): CourtWitnessBridgeResult {
  return {
    ok: false,
    code,
    status,
    contract: COURT_WITNESS_BRIDGE_CONTRACT,
    subject,
    ...partial,
    reasons,
  };
}

async function readJsonBounded(response: Response, label: string): Promise<JsonRecord> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel();
    } catch {
      // The authoritative size rejection survives a stream that was already closed.
    }
    throw new Error(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (!response.body) throw new Error(`${label} returned an empty response`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The authoritative size rejection survives a stream that was already closed.
        }
        throw new Error(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned non-JSON output`);
  }
  return record(parsed, `${label} response`);
}

function verifyKodyResponse(packet: unknown, value: unknown): {
  response: JsonRecord;
  receipt: JsonRecord;
  solHandoff: JsonRecord;
  promptosHandoff: JsonRecord;
} {
  const subject = packetSubject(packet);
  const response = record(value, 'Kody');
  if (response.ok !== true || response.schema !== 'juss/fcr-court-witness-webhook-response@v1') {
    throw new Error('Kody response contract mismatch');
  }
  exactAuthority(response.authority, 'Kody.authority');

  const receipt = record(response.receipt, 'Kody.receipt');
  if (receipt.schema !== 'juss/court-council-witness@v1') throw new Error('Kody receipt schema mismatch');
  const receiptFingerprint = verifyBoundFingerprint(receipt, 'receiptFingerprint', 'Kody.receipt');

  const packetRecord = record(packet, 'packet');
  for (const [field, expected] of Object.entries({
    caseId: subject.caseId,
    repository: subject.repository,
    branch: subject.branch,
    headSha: subject.headSha,
    observedAt: text(packetRecord.observedAt, 'packet.observedAt', 80),
    expiresAt: text(packetRecord.expiresAt, 'packet.expiresAt', 80),
    founderGoal: text(packetRecord.founderGoal, 'packet.founderGoal', 4_000),
    stopCondition: text(packetRecord.stopCondition, 'packet.stopCondition', 2_000),
  })) {
    if (receipt[field] !== expected) throw new Error(`Kody receipt ${field} does not match request`);
  }
  exactAuthority(receipt.authority, 'Kody.receipt.authority');

  const handoffs = record(response.handoffs, 'Kody.handoffs');
  if (handoffs.schema !== 'juss/court-council-handoffs@v1') throw new Error('Kody handoff container schema mismatch');
  if (handoffs.sourceReceiptFingerprint !== receiptFingerprint) {
    throw new Error('Kody handoffs are bound to a different witness receipt');
  }
  exactAuthority(handoffs.authority, 'Kody.handoffs.authority');

  const solHandoff = record(handoffs.sol, 'Kody.handoffs.sol');
  if (solHandoff.schema !== 'juss/sol-court-continuity-handoff@v1') throw new Error('Sol handoff schema mismatch');
  const solFingerprint = verifyBoundFingerprint(solHandoff, 'handoffFingerprint', 'Kody.handoffs.sol');
  if (solHandoff.witnessReceiptFingerprint !== receiptFingerprint) throw new Error('Sol handoff receipt binding mismatch');
  exactAuthority(solHandoff.authority, 'Kody.handoffs.sol.authority');

  const promptosHandoff = record(handoffs.promptos, 'Kody.handoffs.promptos');
  if (promptosHandoff.schema !== 'juss/promptos-court-compile-handoff@v1') {
    throw new Error('PromptOS handoff schema mismatch');
  }
  const promptosFingerprint = verifyBoundFingerprint(promptosHandoff, 'handoffFingerprint', 'Kody.handoffs.promptos');
  if (promptosHandoff.witnessReceiptFingerprint !== receiptFingerprint) {
    throw new Error('PromptOS handoff receipt binding mismatch');
  }
  exactAuthority(promptosHandoff.authority, 'Kody.handoffs.promptos.authority');

  for (const handoff of [solHandoff, promptosHandoff]) {
    if (
      handoff.caseId !== subject.caseId
      || handoff.repository !== subject.repository
      || handoff.branch !== subject.branch
      || handoff.headSha !== subject.headSha
      || handoff.observedAt !== receipt.observedAt
      || handoff.expiresAt !== receipt.expiresAt
    ) {
      throw new Error('Kody handoff subject or lease does not match verified receipt');
    }
  }
  if (
    promptosHandoff.founderGoal !== receipt.founderGoal
    || promptosHandoff.stopCondition !== receipt.stopCondition
  ) {
    throw new Error('PromptOS handoff goal boundary does not match verified receipt');
  }

  // Ensure both claimed fingerprints were actually consumed by downstream checks.
  hash(solFingerprint, 'solFingerprint');
  hash(promptosFingerprint, 'promptosFingerprint');

  return { response, receipt, solHandoff, promptosHandoff };
}

function verifySolResponse(subject: NonNullable<CourtWitnessBridgeResult['subject']>, handoff: JsonRecord, value: unknown): JsonRecord {
  const response = record(value, 'Sol');
  if (response.service !== 'solcontinuity-api' || response.authority !== 'none') {
    throw new Error('Sol response identity or authority mismatch');
  }
  const marker = record(response.marker, 'Sol.marker');
  if (marker.version !== 1 || marker.kind !== 'sol/court-continuity@v1') {
    throw new Error('Sol continuity marker schema mismatch');
  }
  if (!['FRESH', 'EXPIRED'].includes(String(marker.lease_state))) {
    throw new Error('Sol continuity lease state is unsupported');
  }
  if (!['FRESH', 'CHALLENGE'].includes(String(marker.continuity_state))) {
    throw new Error('Sol continuity state is unsupported');
  }
  if (
    marker.source_handoff_fingerprint !== handoff.handoffFingerprint
    || marker.witness_receipt_fingerprint !== handoff.witnessReceiptFingerprint
    || marker.repository !== subject.repository
    || marker.branch !== subject.branch
    || marker.head_sha !== subject.headSha
  ) {
    throw new Error('Sol continuity marker is bound to a different evidence subject');
  }
  const continuityFingerprint = hash(marker.continuity_fingerprint, 'Sol.marker.continuity_fingerprint');
  const solIdentity = {
    version: marker.version,
    kind: marker.kind,
    source_handoff_fingerprint: marker.source_handoff_fingerprint,
    witness_receipt_fingerprint: marker.witness_receipt_fingerprint,
    repository: marker.repository,
    branch: marker.branch,
    head_sha: marker.head_sha,
    observed_at: marker.observed_at,
    expires_at: marker.expires_at,
    lease_state: marker.lease_state,
    continuity_state: marker.continuity_state,
    stale_witness_ids: marker.stale_witness_ids,
    duplicate_chain_count: marker.duplicate_chain_count,
    unique_evidence_chain_count: marker.unique_evidence_chain_count,
    drift_reasons: marker.drift_reasons,
  };
  if (stableHash(solIdentity) !== continuityFingerprint) {
    throw new Error('Sol continuity marker fingerprint mismatch');
  }
  exactAuthority(marker.authority, 'Sol.marker.authority');
  return response;
}

function verifyPromptOsResponse(
  subject: NonNullable<CourtWitnessBridgeResult['subject']>,
  handoff: JsonRecord,
  value: unknown,
): JsonRecord {
  const response = record(value, 'PromptOS');
  if (response.service !== 'promptos' || response.authority !== 'none') {
    throw new Error('PromptOS response identity or authority mismatch');
  }
  fullSha(response.release_sha, 'PromptOS.release_sha');
  const result = record(response.result, 'PromptOS.result');
  if (result.schema !== 'juss/promptos-court-workflow@v1') throw new Error('PromptOS workflow schema mismatch');
  if (
    result.caseId !== subject.caseId
    || result.sourceHandoffFingerprint !== handoff.handoffFingerprint
    || result.witnessReceiptFingerprint !== handoff.witnessReceiptFingerprint
    || result.observedAt !== handoff.observedAt
    || result.expiresAt !== handoff.expiresAt
  ) {
    throw new Error('PromptOS workflow is bound to a different handoff or lease');
  }
  const workflowSubject = record(result.subject, 'PromptOS.result.subject');
  if (
    workflowSubject.repository !== subject.repository
    || workflowSubject.branch !== subject.branch
    || workflowSubject.headSha !== subject.headSha
  ) {
    throw new Error('PromptOS workflow is bound to a different evidence subject');
  }
  const workflowFingerprint = hash(result.workflowFingerprint, 'PromptOS.result.workflowFingerprint');
  const workflowCore = { ...result };
  delete workflowCore.workflowFingerprint;
  if (stableHash(workflowCore) !== workflowFingerprint) {
    throw new Error('PromptOS workflow fingerprint mismatch');
  }
  exactAuthority(result.authority, 'PromptOS.result.authority');
  if (!['COMPILED', 'BLOCKED_STALE_HANDOFF'].includes(String(result.state))) {
    throw new Error('PromptOS workflow state is unsupported');
  }
  return response;
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  label: string,
  bearerToken?: string | null,
): Promise<{ response: Response; body: JsonRecord }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    let errorBody: JsonRecord = {};
    try {
      errorBody = await readJsonBounded(response, label);
    } catch {
      // Preserve the authoritative HTTP rejection even when the provider body
      // is empty, non-JSON, or intentionally opaque.
    }
    return { response, body: errorBody };
  }
  return { response, body: await readJsonBounded(response, label) };
}

export async function dispatchCourtWitnessBridge(
  packet: unknown,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike } = {},
): Promise<CourtWitnessBridgeResult> {
  let subject: CourtWitnessBridgeSubject;
  try {
    subject = packetSubject(packet);
  } catch (error) {
    return failure('INVALID_PACKET', 400, null, [error instanceof Error ? error.message : 'invalid Court packet']);
  }

  let config: BridgeConfig;
  try {
    config = readCourtWitnessBridgeConfig(options.env ?? process.env);
  } catch (error) {
    return failure('BRIDGE_NOT_CONFIGURED', 503, subject, [
      error instanceof Error ? error.message : 'Court bridge configuration is invalid',
    ]);
  }

  if (!config.enabled) {
    return failure('BRIDGE_DISABLED', 503, subject, ['FCR Court witness bridge is disabled']);
  }

  const missing = [
    !config.kodyUrl && 'FCR_KODY_COURT_WITNESS_URL',
    !config.solUrl && 'SOLCONTINUITY_COURT_URL',
    !config.solToken && 'SOLCONTINUITY_COURT_BRIDGE_TOKEN',
    !config.promptosUrl && 'PROMPTOS_COURT_URL',
    !config.promptosToken && 'PROMPTOS_COURT_BRIDGE_KEY',
  ].filter(Boolean) as string[];
  if (missing.length) {
    return failure('BRIDGE_NOT_CONFIGURED', 503, subject, [
      `Court witness bridge requires: ${missing.join(', ')}`,
    ]);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let kodyBody: JsonRecord;
  try {
    const result = await postJson(fetchImpl, config.kodyUrl!, packet, 'Kody Court witness');
    if (!result.response.ok) {
      return failure('KODY_REJECTED', 502, subject, [`Kody rejected Court witness with HTTP ${result.response.status}`]);
    }
    kodyBody = result.body;
  } catch {
    return failure('KODY_UNREACHABLE', 502, subject, ['Kody Court witness outcome is unknown; no downstream calls were attempted']);
  }

  let verifiedKody: ReturnType<typeof verifyKodyResponse>;
  try {
    verifiedKody = verifyKodyResponse(packet, kodyBody);
  } catch (error) {
    return failure('KODY_RECEIPT_INVALID', 502, subject, [
      error instanceof Error ? error.message : 'Kody Court witness receipt is invalid',
    ], { kody: kodyBody, sol: null, promptos: null });
  }

  let solBody: JsonRecord;
  try {
    const result = await postJson(
      fetchImpl,
      config.solUrl!,
      verifiedKody.solHandoff,
      'Sol Court continuity',
      config.solToken,
    );
    if (!result.response.ok) {
      return failure('SOL_REJECTED', 502, subject, [`Sol rejected Court continuity with HTTP ${result.response.status}`], {
        kody: verifiedKody.response,
        sol: result.body,
        promptos: null,
      });
    }
    solBody = result.body;
  } catch {
    return failure('SOL_UNREACHABLE', 502, subject, ['Sol Court continuity outcome is unknown; PromptOS was not called'], {
      kody: verifiedKody.response,
      sol: null,
      promptos: null,
    });
  }

  let verifiedSol: JsonRecord;
  try {
    verifiedSol = verifySolResponse(subject, verifiedKody.solHandoff, solBody);
  } catch (error) {
    return failure('SOL_RECEIPT_INVALID', 502, subject, [
      error instanceof Error ? error.message : 'Sol Court continuity receipt is invalid',
    ], { kody: verifiedKody.response, sol: solBody, promptos: null });
  }

  let promptosBody: JsonRecord;
  try {
    const result = await postJson(
      fetchImpl,
      config.promptosUrl!,
      verifiedKody.promptosHandoff,
      'PromptOS Court compiler',
      config.promptosToken,
    );
    if (!result.response.ok) {
      return failure('PROMPTOS_REJECTED', 502, subject, [
        `PromptOS rejected Court compilation with HTTP ${result.response.status}`,
      ], { kody: verifiedKody.response, sol: verifiedSol, promptos: result.body });
    }
    promptosBody = result.body;
  } catch {
    return failure('PROMPTOS_UNREACHABLE', 502, subject, ['PromptOS Court compiler outcome is unknown'], {
      kody: verifiedKody.response,
      sol: verifiedSol,
      promptos: null,
    });
  }

  let verifiedPromptOs: JsonRecord;
  try {
    verifiedPromptOs = verifyPromptOsResponse(subject, verifiedKody.promptosHandoff, promptosBody);
  } catch (error) {
    return failure('PROMPTOS_RECEIPT_INVALID', 502, subject, [
      error instanceof Error ? error.message : 'PromptOS Court compiler receipt is invalid',
    ], { kody: verifiedKody.response, sol: verifiedSol, promptos: promptosBody });
  }

  return {
    ok: true,
    code: 'COMPLETE',
    status: 200,
    contract: COURT_WITNESS_BRIDGE_CONTRACT,
    subject,
    kody: verifiedKody.response,
    sol: verifiedSol,
    promptos: verifiedPromptOs,
    reasons: [],
  };
}
