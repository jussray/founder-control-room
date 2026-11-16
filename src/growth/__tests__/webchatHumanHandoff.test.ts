import { describe, expect, it } from 'vitest';
import { observeFirstPartyWebchat } from '../webchatObserve.js';
import {
  buildWebchatHumanHandoff,
  HUMAN_HANDOFF_ACKNOWLEDGEMENT,
  parseHumanHandoffCommand,
  WEBCHAT_HUMAN_HANDOFF_CONTRACT,
  webchatBotMayReply,
} from '../webchatHumanHandoff.js';

const base = {
  projectId: 'founder-control-room',
  brandId: 'founder-control-room',
  entryFlowFingerprintId: 'entry:fcr:61f9e074',
  conversationId: 'conversation:abc12345',
  anonymousVisitorId: 'visitor:xyz12345',
  purpose: 'support' as const,
  occurredAt: '2026-11-15T21:00:00.000Z',
};

describe('parseHumanHandoffCommand', () => {
  it('accepts /human with and without a reason, case-insensitively', () => {
    expect(parseHumanHandoffCommand('/human')).toEqual({ requested: true, reason: null });
    expect(parseHumanHandoffCommand('  /HUMAN  ')).toEqual({ requested: true, reason: null });
    expect(parseHumanHandoffCommand('/human billing\n question')).toEqual({ requested: true, reason: 'billing question' });
  });

  it('ignores non-commands and lookalikes', () => {
    for (const text of ['human', 'is a /human there?', '/humans', '/humanize', '', undefined, null]) {
      expect(parseHumanHandoffCommand(text).requested).toBe(false);
    }
  });

  it('caps the reason length', () => {
    expect(parseHumanHandoffCommand(`/human ${'x'.repeat(500)}`).reason).toHaveLength(280);
  });
});

describe('buildWebchatHumanHandoff', () => {
  it('pauses the bot and queues a pending human handoff without dispatch authority', () => {
    const handoff = buildWebchatHumanHandoff(observeFirstPartyWebchat({ ...base, text: '/human refund help' }));

    expect(handoff).not.toBeNull();
    expect(handoff?.contract).toBe(WEBCHAT_HUMAN_HANDOFF_CONTRACT);
    expect(handoff?.state).toBe('pending_human');
    expect(handoff?.botPaused).toBe(true);
    expect(handoff?.canDispatch).toBe(false);
    expect(handoff?.automationMode).toBe('draft_only');
    expect(handoff?.reason).toBe('refund help');
    expect(handoff?.providerConversationId).toBe(base.conversationId);
    expect(handoff?.visitorAcknowledgement).toBe(HUMAN_HANDOFF_ACKNOWLEDGEMENT);
    expect(handoff?.idempotencyKey).toMatch(/^webchat-handoff:[a-f0-9]{64}$/);
  });

  it('makes no response-time promise to the visitor', () => {
    expect(HUMAN_HANDOFF_ACKNOWLEDGEMENT).not.toMatch(/\d|minute|hour|soon|immediately|right away/i);
  });

  it('returns null for ordinary messages', () => {
    expect(buildWebchatHumanHandoff(observeFirstPartyWebchat({ ...base, text: 'hello' }))).toBeNull();
    expect(buildWebchatHumanHandoff(observeFirstPartyWebchat(base))).toBeNull();
  });

  it('is idempotent for the same observation', () => {
    const observation = observeFirstPartyWebchat({ ...base, text: '/human' });
    expect(buildWebchatHumanHandoff(observation)?.idempotencyKey)
      .toBe(buildWebchatHumanHandoff(observation)?.idempotencyKey);
  });

  it('does not leak the raw anonymous visitor id', () => {
    const handoff = buildWebchatHumanHandoff(observeFirstPartyWebchat({ ...base, text: '/human' }));
    expect(JSON.stringify(handoff)).not.toContain(base.anonymousVisitorId);
  });

  it('rejects non-webchat or outbound envelopes', () => {
    const observation = observeFirstPartyWebchat({ ...base, text: '/human' });
    expect(() => buildWebchatHumanHandoff({
      ...observation,
      envelope: { ...observation.envelope, direction: 'outbound' },
    })).toThrow(/inbound webchat/);
  });
});

describe('webchatBotMayReply', () => {
  it('blocks bot replies only for the conversation with an open handoff', () => {
    const handoff = buildWebchatHumanHandoff(observeFirstPartyWebchat({ ...base, text: '/human' }));
    const open = handoff ? [handoff] : [];
    expect(webchatBotMayReply(base.conversationId, open)).toBe(false);
    expect(webchatBotMayReply('conversation:other999', open)).toBe(true);
    expect(webchatBotMayReply(base.conversationId, [])).toBe(true);
  });
});
