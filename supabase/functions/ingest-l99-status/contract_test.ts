import {
  assertEquals,
  assertThrows,
} from 'jsr:@std/assert@1';
import {
  eventSeverity,
  evidenceStatus,
  validateStatusEnvelope,
} from './contract.ts';

const COMMIT = 'a'.repeat(40);
const NOW = Date.parse('2026-07-13T05:00:00.000Z');

function validEnvelope() {
  return {
    schema_version: '1.0',
    repository: 'jussray/l99-',
    commit: COMMIT,
    observed_at: '2026-07-13T04:59:00.000Z',
    status: 'at-risk',
    risk_level: 'high',
    gate_status: 'pass',
    gate_results: [
      { gate: 'provenance', passed: true },
      { gate: 'revocation', passed: true },
    ],
    proof_refs: ['control-room.manifest.json', 'runtime/promotion_gates.py'],
    blockers: ['Tenant-safe authorization remains a release blocker.'],
    next_gate: 'Complete tenant-safe authorization before production release.',
    source_run_id: '123456789',
    source_run_attempt: 1,
  };
}

Deno.test('accepts a bounded sanitized exact-commit envelope', () => {
  const envelope = validateStatusEnvelope(validEnvelope(), COMMIT, NOW);
  assertEquals(envelope.repository, 'jussray/l99-');
  assertEquals(envelope.gate_status, 'pass');
  assertEquals(eventSeverity(envelope), 'warning');
  assertEquals(evidenceStatus(envelope), 'warn');
});

Deno.test('rejects commit claims that do not match GitHub OIDC', () => {
  assertThrows(
    () => validateStatusEnvelope(validEnvelope(), 'b'.repeat(40), NOW),
    Error,
    'commit_does_not_match_oidc_claim',
  );
});

Deno.test('rejects a forged gate summary', () => {
  const payload = validEnvelope();
  payload.gate_status = 'pass';
  payload.gate_results[1].passed = false;
  assertThrows(
    () => validateStatusEnvelope(payload, COMMIT, NOW),
    Error,
    'gate_status_mismatch',
  );
});

Deno.test('rejects sensitive material anywhere in the payload', () => {
  const payload = validEnvelope();
  payload.blockers = ['API_KEY=do-not-store-this'];
  assertThrows(
    () => validateStatusEnvelope(payload, COMMIT, NOW),
    Error,
    'payload_contains_sensitive_material',
  );
});

Deno.test('failed gates become error evidence and hold promotion', () => {
  const payload = validEnvelope();
  payload.status = 'blocked';
  payload.gate_status = 'fail';
  payload.gate_results[1].passed = false;
  const envelope = validateStatusEnvelope(payload, COMMIT, NOW);
  assertEquals(eventSeverity(envelope), 'error');
  assertEquals(evidenceStatus(envelope), 'fail');
});
