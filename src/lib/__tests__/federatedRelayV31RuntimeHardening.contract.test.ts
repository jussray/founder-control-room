import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/http/routes/federatedRelayV31.ts', 'utf8');
const proof = readFileSync('scripts/prove-federated-agent-roundtrip-v31.mjs', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260913224500_federated_relay_v31_observed_key_registration.sql',
  'utf8',
);

describe('federated relay v3.1 runtime hardening contract', () => {
  it('accepts historical source commits reachable from the claimed branch without requiring current-head equality', () => {
    expect(route).toContain("repositoryProvider(identity).compare(");
    expect(route).toContain("identity.headSha,");
    expect(route).toContain("identity.branch,");
    expect(route).toContain("comparison.behindBy !== 0");
    expect(route).toContain("relay_source_commit_detached");
    expect(route).not.toContain("sourceHead !== envelope.source.headSha");
  });

  it('binds the target to the exact candidate branch and runtime SHA instead of hard-coding main', () => {
    expect(route).not.toContain("envelope.target.branch !== 'main'");
    expect(route).toContain("resolveBranchHead(envelope.target)");
    expect(route).toContain("targetHead !== envelope.target.headSha || targetHead !== runtimeHeadSha");
    expect(route).toContain("branch: envelope.target.branch");
  });

  it('uses the receiver-owned durable key registry as the FCR acceptance trust root', () => {
    expect(route).toContain("return localPublicKey(envelope.source.member, envelope.signature.keyId)");
    expect(route).not.toContain("await runtimeSha(envelope.source.member");
    expect(proof).toContain("federated_relay_v31_register_observed_key");
    expect(proof).toContain("X-Federated-Relay-Source-Origin");
  });

  it('keeps observed-key registration service-role-only and public-key-only', () => {
    expect(migration).toContain("p_member not in ('chief-ai-machine','solcontinuity','promptos')");
    expect(migration).toContain("p_public_key_jwk->>'kty' <> 'OKP'");
    expect(migration).toContain("p_public_key_jwk ? 'd'");
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = \'\'');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });
});
