import { describe, expect, it } from 'vitest';
import {
  FEDERATED_AGENT_RELAY_CONTRACT,
  acceptFederatedAgentRelay,
  parseFederatedAgentRelayEnvelope,
} from '../federatedRelay.js';

const FCR_SHA = 'a'.repeat(40);
const CHIEF_SHA = 'b'.repeat(40);
const CONTEXT = 'c'.repeat(64);
const COOKIE = `Q4:v1:${'d'.repeat(64)}`;
const PROOF = `https://github.com/jussray/founder-control-room/commit/${FCR_SHA}`;

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    contract: FEDERATED_AGENT_RELAY_CONTRACT,
    messageId: 'q4msg:fcr-to-chief:0001',
    from: 'founder-control-room',
    to: 'chief-ai-machine',
    sourceRepository: 'jussray/founder-control-room',
    sourceBranch: 'main',
    sourceHeadSha: FCR_SHA,
    targetRepository: 'jussray/chief-ai-machine',
    targetBranch: 'main',
    targetObservedHeadSha: CHIEF_SHA,
    subject: 'Current-goal evidence handoff',
    payload: 'Reconcile this evidence against Chief local truth before reasoning forward.',
    contextFingerprint: CONTEXT,
    proofCookie: COOKIE,
    evidenceRefs: [PROOF],
    ...overrides,
  };
}

describe('federated agent relay', () => {
  it('accepts an exact quartet handoff and emits a non-authoritative successor cookie', () => {
    const parsed = parseFederatedAgentRelayEnvelope(envelope());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const receipt = acceptFederatedAgentRelay(parsed.envelope);
    expect(receipt).toMatchObject({
      contract: FEDERATED_AGENT_RELAY_CONTRACT,
      status: 'accepted',
      from: 'founder-control-room',
      to: 'chief-ai-machine',
      predecessorProofCookie: COOKIE,
      executionAuthorized: false,
      authorityTransferred: false,
      approvalCarriedForward: false,
    });
    expect(receipt.messageFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.successorProofCookie).toMatch(/^Q4R:v1:[0-9a-f]{64}$/);
    expect(receipt.nextGate).toContain('independently re-verify');
  });

  it('supports a bound reply in the opposite direction', () => {
    const first = parseFederatedAgentRelayEnvelope(envelope());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstReceipt = acceptFederatedAgentRelay(first.envelope);

    const reply = parseFederatedAgentRelayEnvelope(envelope({
      messageId: 'q4msg:chief-to-fcr:0002',
      replyToMessageId: firstReceipt.messageId,
      from: 'chief-ai-machine',
      to: 'founder-control-room',
      sourceRepository: 'jussray/chief-ai-machine',
      sourceHeadSha: CHIEF_SHA,
      targetRepository: 'jussray/founder-control-room',
      targetObservedHeadSha: FCR_SHA,
      contextFingerprint: firstReceipt.messageFingerprint,
      proofCookie: firstReceipt.successorProofCookie,
      evidenceRefs: [`https://github.com/jussray/chief-ai-machine/commit/${CHIEF_SHA}`],
      payload: 'Chief reconciled the handoff and returns a bounded reasoning receipt.',
    }));

    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    const replyReceipt = acceptFederatedAgentRelay(reply.envelope);
    expect(replyReceipt.replyToMessageId).toBe(firstReceipt.messageId);
    expect(replyReceipt.from).toBe('chief-ai-machine');
    expect(replyReceipt.to).toBe('founder-control-room');
    expect(replyReceipt.predecessorProofCookie).toBe(firstReceipt.successorProofCookie);
    expect(replyReceipt.authorityTransferred).toBe(false);
  });

  it('rejects repository impersonation and authority-shaped extra fields', () => {
    const wrongRepo = parseFederatedAgentRelayEnvelope(envelope({
      sourceRepository: 'jussray/promptos',
    }));
    expect(wrongRepo).toEqual({
      ok: false,
      error: 'Source repository does not match founder-control-room.',
    });

    const smuggledAuthority = parseFederatedAgentRelayEnvelope(envelope({
      executionAuthorized: true,
    }));
    expect(smuggledAuthority).toEqual({
      ok: false,
      error: 'Relay envelope contains unsupported fields.',
    });
  });

  it('rejects malformed fingerprints, cookies, and non-HTTPS evidence', () => {
    expect(parseFederatedAgentRelayEnvelope(envelope({ contextFingerprint: 'stale' })).ok).toBe(false);
    expect(parseFederatedAgentRelayEnvelope(envelope({ proofCookie: 'bad' })).ok).toBe(false);
    expect(parseFederatedAgentRelayEnvelope(envelope({ evidenceRefs: ['http://example.com'] })).ok).toBe(false);
  });
});
