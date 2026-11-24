import { createHash } from 'node:crypto';
import type { FirstPartyWebchatObservation } from './webchatObserve.js';

/**
 * Webchat `/human` handoff contract.
 *
 * Satisfies the `human_handoff` requirement of the webchat channel in
 * config/unified-growth-inbox.channels.json. A visitor typing `/human`
 * (optionally followed by a short reason) asks for a person. The result:
 *
 * - pauses the bot for that conversation (the bot must not auto-reply again
 *   until a human operator explicitly releases it);
 * - queues the conversation as `pending_human` for founder/operator review;
 * - returns an honest visitor acknowledgement with no response-time promise.
 *
 * This module grants no dispatch, outreach, or provider authority. It is pure
 * and deterministic; persistence and delivery belong to a separately reviewed
 * route.
 */
export const WEBCHAT_HUMAN_HANDOFF_CONTRACT = 'fcr-growth-webchat-human-handoff@v1' as const;

export const HUMAN_HANDOFF_COMMAND = '/human' as const;

const MAX_REASON_LENGTH = 280;
const COMMAND_PATTERN = /^\/human(?:\s+([\s\S]*))?$/i;

export const HUMAN_HANDOFF_ACKNOWLEDGEMENT =
  'Got it, you asked for a person. The bot has stopped replying in this chat, and your request is now in the human queue. A member of the team will reply here.';

export interface HumanHandoffCommand {
  requested: boolean;
  reason: string | null;
}

export interface WebchatHumanHandoff {
  contract: typeof WEBCHAT_HUMAN_HANDOFF_CONTRACT;
  projectId: string;
  brandId: string;
  providerConversationId: string;
  providerUserId: string;
  sourceEventId: string;
  idempotencyKey: string;
  requestedAt: string;
  reason: string | null;
  state: 'pending_human';
  botPaused: true;
  visitorAcknowledgement: string;
  automationMode: 'draft_only';
  canDispatch: false;
}

/** Parses a visitor message. Only an exact leading `/human` command counts. */
export function parseHumanHandoffCommand(text: string | undefined | null): HumanHandoffCommand {
  if (typeof text !== 'string') return { requested: false, reason: null };
  const match = text.trim().match(COMMAND_PATTERN);
  if (!match) return { requested: false, reason: null };
  const reason = (match[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
  return { requested: true, reason: reason || null };
}

/**
 * Builds a handoff request from an observed inbound webchat message.
 * Returns null when the message is not a `/human` command.
 */
export function buildWebchatHumanHandoff(
  observation: FirstPartyWebchatObservation,
): WebchatHumanHandoff | null {
  const { envelope } = observation;
  if (envelope.channel !== 'webchat' || envelope.direction !== 'inbound') {
    throw new Error('human handoff requires an inbound webchat observation');
  }
  const command = parseHumanHandoffCommand(envelope.sanitizedText);
  if (!command.requested) return null;

  const handoffHash = createHash('sha256')
    .update([
      WEBCHAT_HUMAN_HANDOFF_CONTRACT,
      envelope.projectId,
      envelope.providerConversationId,
      envelope.providerEventId,
    ].join('|'))
    .digest('hex');

  return {
    contract: WEBCHAT_HUMAN_HANDOFF_CONTRACT,
    projectId: envelope.projectId,
    brandId: envelope.brandId,
    providerConversationId: envelope.providerConversationId,
    providerUserId: envelope.providerUserId,
    sourceEventId: envelope.providerEventId,
    idempotencyKey: `webchat-handoff:${handoffHash}`,
    requestedAt: envelope.receivedAt,
    reason: command.reason,
    state: 'pending_human',
    botPaused: true,
    visitorAcknowledgement: HUMAN_HANDOFF_ACKNOWLEDGEMENT,
    automationMode: 'draft_only',
    canDispatch: false,
  };
}

/**
 * The bot may draft a reply only while no handoff is open for the
 * conversation. Releasing a paused conversation is a human-operator action
 * outside this module.
 */
export function webchatBotMayReply(
  conversationId: string,
  openHandoffs: readonly Pick<WebchatHumanHandoff, 'providerConversationId' | 'state'>[],
): boolean {
  return !openHandoffs.some(
    (handoff) => handoff.providerConversationId === conversationId && handoff.state === 'pending_human',
  );
}
