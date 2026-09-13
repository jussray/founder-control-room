import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import type { ControlRoomWorkerEnv } from '../handler.js';
import { canonicalRelayRequestV31, handleFederatedRelayV31Worker } from '../federatedRelayV31.js';
import { sha256HexV31 } from '../../federated-relay/index.js';

const FCR_SHA = 'a'.repeat(40);
const CHIEF_SHA = 'b'.repeat(40);
function env(): ControlRoomWorkerEnv {
  return {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_PUBLISHABLE_KEY: 'publishable', FOUNDER_SESSION_ENCRYPTION_KEY: 'A'.repeat(43), GITHUB_WEBHOOK_SECRET: 'webhook', GITHUB_TOKEN: 'token', FOUNDER_ALLOWED_ORIGINS: 'https://example.com', FOUNDER_API_URL: 'https://api.example.com', FCR_EMAIL: {} as ControlRoomWorkerEnv['FCR_EMAIL'], FCR_EMAIL_FROM: 'unused', FCR_V10_CAPABILITY_PLAN_CONTRACT: 'unused', FCR_V10_CONVEYOR_CONTRACT: 'unused', FCR_V10_MAX_RUNTIME_AUTHORITY: 'draft', FCR_V10_REGISTRY_RESOLUTION_REQUIRED: 'true', FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true',
  };
}
function envelope() {
  const body = '{"execute":true}';
  return {
    contract: 'juss/federated-agent-relay@v3.1', messageId: '11111111-1111-4111-8111-111111111111',
    ordering: { chainId: '33333333-3333-4333-8333-333333333333', sourceSequence: 0, chainPosition: 0, logicalOperationId: '44444444-4444-4444-8444-444444444444', relation: { type: 'root' } },
    source: { member: 'chief-ai-machine', repository: 'jussray/chief-ai-machine', branch: 'main', headSha: CHIEF_SHA }, target: { member: 'founder-control-room', repository: 'jussray/founder-control-room', branch: 'main', headSha: FCR_SHA }, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: '22222222-2222-4222-8222-222222222222', disposition: 'observe', subject: 'worker ingress', payload: { contentType: 'application/json', body, sha256: sha256HexV31(body) }, contextFingerprint: 'c'.repeat(64), predecessorProofCookie: 'Q4R:v3.1:genesis', evidence: [], supersedesMessageIds: [], signature: { algorithm: 'Ed25519', keyId: 'chief-test', valueBase64Url: Buffer.alloc(64).toString('base64url') },
  };
}

describe('FCR federated relay Worker ingress', () => {
  it('is mounted as a raw canonical request and fails closed without relay key bindings', async () => {
    const request = new Request('https://fcr.example/api/federated-relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: canonicalRelayRequestV31(envelope()) });
    const response = await handleFederatedRelayV31Worker(request, env());
    expect(response.status).toBe(503);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload.executionAuthorized).toBe(false);
    expect(payload.authorityTransferred).toBe(false);
  });
  it('rejects duplicate-key noncanonical JSON before any authority lookup', async () => {
    const response = await handleFederatedRelayV31Worker(new Request('https://fcr.example/api/federated-relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1,"a":1}' }), env());
    expect(response.status).toBe(400);
  });
  it('rejects non-json content types', async () => {
    const response = await handleFederatedRelayV31Worker(new Request('https://fcr.example/api/federated-relay', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }), env());
    expect(response.status).toBe(415);
  });
});
