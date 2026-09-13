import { createClient } from '@supabase/supabase-js';
import type { ControlRoomWorkerEnv } from './handler.js';
import { providerForProject } from '../providers/providerFactory.js';
import {
  acceptFederatedRelayV31,
  canonicalizeRelayJcsV31,
  createSupabaseRelayLedgerV31,
  parseCanonicalRelayV31Json,
  RelayTransientErrorV31,
  RelayV31Error,
  type FederatedAgentMemberV31,
  type RelayReceiptSignerV31,
  type RelaySignatureVerifierV31,
  type RelaySourceEvidenceResolverV31,
} from '../federated-relay/index.js';

const MAX_ENVELOPE_BYTES = 512 * 1024;
const SHA40 = /^[0-9a-f]{40}$/;

type RelayKeyRecord = {
  member: FederatedAgentMemberV31;
  keyId: string;
  state: 'active' | 'retiring' | 'revoked';
  validFrom: string;
  validUntil: string | null;
  publicKeyJwk: JsonWebKey;
};

type RelayWorkerEnv = ControlRoomWorkerEnv & {
  GIT_SHA?: string;
  FEDERATED_RELAY_BRANCH?: string;
  FEDERATED_RELAY_PUBLIC_KEYS_JSON?: string;
  FEDERATED_RELAY_RECEIPT_PRIVATE_JWK?: string;
  FEDERATED_RELAY_RECEIPT_KEY_ID?: string;
};

class RelayIngressError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'RelayIngressError';
  }
}

function requireBinding(env: RelayWorkerEnv, name: keyof RelayWorkerEnv): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new RelayIngressError(`relay_${String(name).toLowerCase()}_unconfigured`, 503);
  return value.trim();
}

async function readBoundedUtf8(request: Request): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_ENVELOPE_BYTES) throw new RelayIngressError('relay_envelope_too_large', 413);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ENVELOPE_BYTES) {
      await reader.cancel();
      throw new RelayIngressError('relay_envelope_too_large', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RelayIngressError('relay_utf8_invalid', 400);
  }
}

function parseRegistry(env: RelayWorkerEnv): RelayKeyRecord[] {
  const raw = requireBinding(env, 'FEDERATED_RELAY_PUBLIC_KEYS_JSON');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new RelayIngressError('relay_key_registry_invalid', 503); }
  if (!Array.isArray(value)) throw new RelayIngressError('relay_key_registry_invalid', 503);
  return value as RelayKeyRecord[];
}

function makeSignatureVerifier(env: RelayWorkerEnv): RelaySignatureVerifierV31 {
  return {
    async verify(input) {
      const key = parseRegistry(env).find((candidate) => candidate?.member === input.member && candidate?.keyId === input.keyId);
      if (!key || !['active', 'retiring', 'revoked'].includes(key.state) || typeof key.validFrom !== 'string' || !key.publicKeyJwk) {
        throw new RelayV31Error('relay_key_unknown');
      }
      let cryptoKey: CryptoKey;
      try {
        cryptoKey = await globalThis.crypto.subtle.importKey('jwk', key.publicKeyJwk, 'Ed25519', false, ['verify']);
      } catch {
        throw new RelayIngressError('relay_public_key_invalid', 503);
      }
      const verified = await globalThis.crypto.subtle.verify('Ed25519', cryptoKey, input.signature, input.canonicalUnsignedBytes);
      if (!verified) throw new RelayV31Error('relay_signature_invalid');
      return { member: key.member, keyId: key.keyId, state: key.state, validFrom: key.validFrom, validUntil: key.validUntil ?? null };
    },
  };
}

function makeReceiptSigner(env: RelayWorkerEnv): RelayReceiptSignerV31 {
  return {
    async sign(input) {
      const raw = requireBinding(env, 'FEDERATED_RELAY_RECEIPT_PRIVATE_JWK');
      const keyId = requireBinding(env, 'FEDERATED_RELAY_RECEIPT_KEY_ID');
      let jwk: JsonWebKey;
      try { jwk = JSON.parse(raw) as JsonWebKey; } catch { throw new RelayIngressError('relay_receipt_private_key_invalid', 503); }
      let privateKey: CryptoKey;
      try {
        privateKey = await globalThis.crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['sign']);
      } catch {
        throw new RelayIngressError('relay_receipt_private_key_invalid', 503);
      }
      const bytes = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', privateKey, input.canonicalReceiptBytes));
      return { algorithm: 'Ed25519', keyId, valueBase64Url: Buffer.from(bytes).toString('base64url') };
    },
  };
}

function makeRepositoryResolver(): RelaySourceEvidenceResolverV31 {
  const cache = new Map<string, { slug: string; provider: ReturnType<typeof providerForProject> }>();
  const providerForRepository = (repository: string) => {
    const existing = cache.get(repository);
    if (existing) return existing;
    const slug = `relay-${repository.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const provider = providerForProject({ repo_provider: 'github', slug, repo_identifier: repository });
    const value = { slug, provider };
    cache.set(repository, value);
    return value;
  };
  const isNotFound = (error: unknown) => error instanceof Error && /\b404\b|not found/i.test(error.message);
  const currentBranchHeadSha = async ({ repository, branch }: { repository: string; branch: string }) => {
    const { slug, provider } = providerForRepository(repository);
    try {
      const resolved = (await provider.resolveRef(slug, branch)).trim().toLowerCase();
      return SHA40.test(resolved) ? resolved : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new RelayIngressError('relay_head_provider_failed', 503);
    }
  };
  return {
    currentBranchHeadSha,
    async commitExists({ repository, sha }) {
      const { slug, provider } = providerForRepository(repository);
      try {
        return (await provider.resolveRef(slug, sha)).trim().toLowerCase() === sha.toLowerCase();
      } catch (error) {
        if (isNotFound(error)) return false;
        throw new RelayIngressError('relay_commit_provider_failed', 503);
      }
    },
    async isCommitReachableFromBranch({ repository, branch, sha }) {
      return (await currentBranchHeadSha({ repository, branch })) === sha.toLowerCase();
    },
  };
}

function statusFor(error: unknown): number {
  if (error instanceof RelayIngressError) return error.status;
  if (error instanceof RelayTransientErrorV31) return 503;
  if (error instanceof RelayV31Error) {
    if (/signature|key_/.test(error.code)) return 401;
    if (/stale|collision|sequence|lineage|parent|supersession|cookie|current_head/.test(error.code)) return 409;
    return 400;
  }
  if (error instanceof Error && /^relay_/.test(error.message)) return 409;
  return 500;
}

export async function handleFederatedRelayV31Worker(request: Request, workerEnv: ControlRoomWorkerEnv): Promise<Response> {
  const env = workerEnv as RelayWorkerEnv;
  try {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if ((request.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      throw new RelayIngressError('relay_content_type', 415);
    }
    const raw = await readBoundedUtf8(request);
    const envelope = parseCanonicalRelayV31Json(raw);
    const runtimeSha = (env.GIT_SHA ?? '').trim().toLowerCase();
    if (!SHA40.test(runtimeSha)) throw new RelayIngressError('relay_runtime_sha_unavailable', 503);
    const branch = env.FEDERATED_RELAY_BRANCH?.trim() || 'main';
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await acceptFederatedRelayV31(envelope, {
      localIdentity: { member: 'founder-control-room', repository: 'jussray/founder-control-room', branch, currentHeadSha: runtimeSha },
      sourceEvidence: makeRepositoryResolver(),
      signatureVerifier: makeSignatureVerifier(env),
      receiptSigner: makeReceiptSigner(env),
      ledger: createSupabaseRelayLedgerV31(client),
    });
    return Response.json(result, {
      status: result.outcome === 'accepted' ? 201 : 200,
      headers: { 'Cache-Control': 'no-store', 'X-Founder-Control-Room-Service': 'founder-control-room' },
    });
  } catch (error) {
    const code = error instanceof RelayIngressError || error instanceof RelayV31Error || error instanceof RelayTransientErrorV31
      ? (error as { code: string }).code
      : error instanceof Error && /^relay_/.test(error.message) ? error.message : 'relay_internal_error';
    return Response.json({ ok: false, error: code, executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false }, {
      status: statusFor(error),
      headers: { 'Cache-Control': 'no-store', 'X-Founder-Control-Room-Service': 'founder-control-room' },
    });
  }
}

export function canonicalRelayRequestV31(value: unknown): string {
  return canonicalizeRelayJcsV31(value);
}
