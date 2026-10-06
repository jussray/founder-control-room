import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RepositoryProvider, VerificationSignal } from '../../providers/RepositoryProvider.js';
import {
  capabilityOutcomeVerificationHash,
  matchingCapabilityOutcomeVerification,
  validateCapabilityOutcomeVerificationReceipt,
  verifyRepositoryRepairOutcome,
} from '../capabilityOutcomeVerification.js';
import {
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayResponseHash,
  type OperatorRelayResponseV1,
} from '../operatorRelay.js';

const HEAD = 'a'.repeat(40);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function relayResponse(
  overrides: Partial<Omit<OperatorRelayResponseV1, 'responseHash'>> = {},
): OperatorRelayResponseV1 {
  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: 'relay-1',
    requestHash: sha256('request-1'),
    fromOperator: 'codex',
    toOperator: 'fcr',
    status: 'completed',
    answer: 'repair complete',
    evidenceRefs: ['provider:openai:response-1'],
    unresolved: [],
    authorityRequested: 'none',
    completedAt: '2026-10-06T20:10:00.000Z',
    ...overrides,
  };
  return { ...identity, responseHash: operatorRelayResponseHash(identity) };
}

function signal(
  name: string,
  status: VerificationSignal['status'] = 'passed',
  overrides: Partial<VerificationSignal> = {},
): VerificationSignal {
  return {
    id: overrides.id ?? String(name.length * 100 + (status === 'passed' ? 1 : 2)),
    name,
    status,
    commitSha: overrides.commitSha ?? HEAD,
    provider: 'github',
    issuer: overrides.issuer ?? { kind: 'app', id: '15368', name: 'github-actions' },
    startedAt: overrides.startedAt ?? '2026-10-06T20:00:00.000Z',
    completedAt: overrides.completedAt ?? '2026-10-06T20:05:00.000Z',
    detailsUrl: overrides.detailsUrl ?? 'https://github.com/jussray/founder-control-room/actions',
    evidenceFingerprint: overrides.evidenceFingerprint,
  };
}

function fakeProvider(signals: VerificationSignal[], exactSha = HEAD): RepositoryProvider {
  return {
    name: 'github',
    resolveRef: async () => exactSha,
    getRef: async () => ({ name: exactSha, commitSha: exactSha, committedAt: '2026-10-06T19:00:00.000Z' }),
    listVerificationSignals: async () => signals,
  } as unknown as RepositoryProvider;
}

const requiredChecks = [
  { name: 'CI', issuerId: '15368' },
  { name: 'Playwright E2E', issuerId: '15368' },
] as const;

describe('repository repair outcome verifier', () => {
  it('issues a non-authorizing verification receipt only from exact-head passed provider evidence', async () => {
    const response = relayResponse();
    const result = await verifyRepositoryRepairOutcome({
      response,
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks,
      requirePlaywright: true,
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', { id: '1001' }),
        signal('Playwright E2E', 'passed', { id: '1002' }),
      ]),
    });

    expect(result.verified).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.receipt).toMatchObject({
      taskClass: 'repository-repair',
      relayId: response.relayId,
      responseHash: response.responseHash,
      operatorId: 'codex',
      subject: {
        repository: 'jussray/founder-control-room',
        exactSha: HEAD,
      },
      outcomeVerified: true,
      selectionAuthority: false,
      executionAuthority: false,
    });
    expect(result.receipt?.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.receipt && validateCapabilityOutcomeVerificationReceipt(result.receipt)).toEqual([]);
    expect(result.receipt && matchingCapabilityOutcomeVerification(
      result.receipt,
      response,
      'repository-repair',
      'codex',
    )).toBe(true);
  });

  it('fails closed when a newer same-name rerun fails after an older pass', async () => {
    const result = await verifyRepositoryRepairOutcome({
      response: relayResponse(),
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', {
          id: '100',
          startedAt: '2026-10-06T19:00:00.000Z',
          completedAt: '2026-10-06T19:05:00.000Z',
        }),
        signal('CI', 'failed', {
          id: '101',
          startedAt: '2026-10-06T20:00:00.000Z',
          completedAt: '2026-10-06T20:01:00.000Z',
        }),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.receipt).toBeNull();
    expect(result.blockers).toContain('required exact-head check is not passed: CI=failed');
  });

  it('requires the configured provider-backed producer identity', async () => {
    const result = await verifyRepositoryRepairOutcome({
      response: relayResponse(),
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', { issuer: { kind: 'app', id: '99999', name: 'lookalike' } }),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('required exact-head check producer mismatch: CI');
  });

  it('refuses Playwright-required repair proof unless the policy declares a browser-shaped check', async () => {
    const result = await verifyRepositoryRepairOutcome({
      response: relayResponse(),
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
      requirePlaywright: true,
    }, {
      providerFactory: () => fakeProvider([
        signal('CI'),
        signal('Playwright E2E'),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('Playwright-required repository repair must declare a browser-shaped required check');
  });

  it('rejects a relay outcome whose canonical response hash was tampered after completion', async () => {
    const response = relayResponse();
    const tampered = { ...response, answer: 'different answer' };

    const result = await verifyRepositoryRepairOutcome({
      response: tampered,
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('relay responseHash does not match response content');
  });

  it('does not verify a response that still declares unresolved work', async () => {
    const result = await verifyRepositoryRepairOutcome({
      response: relayResponse({ unresolved: ['needs provider readback'] }),
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('relay outcome still reports unresolved work');
  });

  it('binds the receipt hash so verification content cannot be rewritten after issuance', async () => {
    const response = relayResponse();
    const result = await verifyRepositoryRepairOutcome({
      response,
      repository: 'jussray/founder-control-room',
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });
    expect(result.receipt).not.toBeNull();

    const receipt = result.receipt!;
    const tampered = {
      ...receipt,
      subject: { ...receipt.subject, exactSha: 'b'.repeat(40) },
    };
    expect(validateCapabilityOutcomeVerificationReceipt(tampered)).toContain('verificationHash does not match verification content');

    const { verificationHash: _verificationHash, ...identity } = receipt;
    expect(capabilityOutcomeVerificationHash(identity)).toBe(receipt.verificationHash);
  });
});
