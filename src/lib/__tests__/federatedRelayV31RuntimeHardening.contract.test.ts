import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/http/routes/federatedRelayV31.ts', 'utf8');
const proof = readFileSync('scripts/prove-federated-agent-roundtrip-v31.mjs', 'utf8');
const repoCycle = readFileSync('scripts/repo-cycle.mjs', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260913224500_federated_relay_v31_observed_key_registration.sql',
  'utf8',
);
const legacyPrivilegeHardening = readFileSync(
  'supabase/migrations/20260913202114_harden_federated_relay_service_role_privileges.sql',
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

  it('revalidates runtime target and source reachability before returning a stored duplicate', () => {
    const runtimeIdentity = route.indexOf("const runtimeHeadSha = process.env.GIT_SHA?.trim() ?? '';");
    const targetResolution = route.indexOf('resolveBranchHead(envelope.target)');
    const sourceReachability = route.indexOf('assertSourceCommitReachable(envelope.source)');
    const storedLookup = route.indexOf('const stored = await findStored(envelope.messageId);');

    expect(runtimeIdentity).toBeGreaterThan(-1);
    expect(targetResolution).toBeGreaterThan(runtimeIdentity);
    expect(sourceReachability).toBeGreaterThan(runtimeIdentity);
    expect(storedLookup).toBeGreaterThan(targetResolution);
    expect(storedLookup).toBeGreaterThan(sourceReachability);
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

  it('requires the compiled v3.1 kernel after build in verify and merge gate', () => {
    expect(repoCycle).toContain('VERIFY_RELAY_BUILD');
    expect(repoCycle).toContain("dist/founder-os-lab/federatedRelayV31.js");
    expect((repoCycle.match(/VERIFY_RELAY_BUILD/g) ?? []).length).toBe(3);
  });

  it('clears provider-default legacy service-role grants before restoring the narrow relay privileges', () => {
    expect(legacyPrivilegeHardening).toContain(
      'revoke all privileges on table public.federated_relay_public_keys from service_role;',
    );
    expect(legacyPrivilegeHardening).toContain(
      'revoke all privileges on table public.federated_relay_sequence_counters from service_role;',
    );
    expect(legacyPrivilegeHardening).toContain(
      'revoke all privileges on table public.federated_relay_messages from service_role;',
    );
    expect(legacyPrivilegeHardening).toContain(
      'revoke all privileges on table public.federated_relay_reply_reservations from service_role;',
    );
    expect(legacyPrivilegeHardening).toMatch(
      /grant select, insert, update\s+on table public\.federated_relay_public_keys\s+to service_role;/u,
    );
    expect(legacyPrivilegeHardening).toMatch(
      /grant select\s+on table public\.federated_relay_messages\s+to service_role;/u,
    );
    expect(legacyPrivilegeHardening).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*federated_relay_messages/iu,
    );
  });
});
