import { describe, expect, it } from 'vitest';
import { validateVoiceCouncilIntent, VOICE_COUNCIL_INTENT_CONTRACT } from '../voiceCouncilIntent.js';

const valid = () => ({
  contract: VOICE_COUNCIL_INTENT_CONTRACT,
  requestId: 'request-1',
  actorId: 'founder',
  workspaceId: 'fcr',
  transcriptDigest: 'a'.repeat(64),
  sourceKind: 'voice',
  observedAt: '2026-10-11T08:00:00Z',
  goal: 'Review signup failure',
  repository: 'jussray/founder-control-room',
  branch: 'main',
  expectedHeadSha: 'b'.repeat(40),
  requestedOperations: ['repo.read', 'council.propose'],
  evidenceRefs: [],
  riskClass: 'low',
  approvalState: 'unapproved',
  councilQuestion: 'What is the smallest safe change?',
});

describe('voice council intent authority boundary', () => {
  it('accepts bounded read-only intent but never grants execution', () => {
    const result = validateVoiceCouncilIntent(valid());
    expect(result.valid).toBe(true);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.executionAuthorized).toBe(false);
  });
  it.each([
    [{ approvalState: 'approved' }, 'voice intent cannot approve'],
    [{ executionAuthorized: true }, 'unknown field'],
    [{ requestedOperations: ['merge.execute'] }, 'invalid requestedOperations'],
    [{ transcriptDigest: 'not-a-hash' }, 'invalid transcriptDigest'],
    [{ expectedHeadSha: 'main' }, 'invalid expectedHeadSha'],
    [{ repository: 'not-a-repo' }, 'invalid repository'],
    [{ requestedOperations: ['repo.read', 'repo.read'] }, 'invalid requestedOperations'],
    [{ branch: '../main' }, 'invalid branch'],
  ])('fails closed for %j', (change, message) => {
    const result = validateVoiceCouncilIntent({ ...valid(), ...change });
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.includes(message))).toBe(true);
    expect(result.executionAuthorized).toBe(false);
  });
});
