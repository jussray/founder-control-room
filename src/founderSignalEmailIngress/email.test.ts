import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  FounderSignalReviewEmailError,
  extractFounderReviewCommand,
  parseFounderSignalReviewEmail,
} from './email.js';
import {
  FounderSignalReviewEmailReceiptError,
  validateFounderSignalReviewEmailReceipt,
} from './receipt.js';

const contextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const recipient = `review+${contextId}@foundercontrolroom.org`;
const options = {
  founderEmail: 'juss@example.com',
  reviewDomain: 'foundercontrolroom.org',
  now: new Date('2026-08-02T21:05:00.000Z'),
};

function rawEmail(headers: string[], body: string): Uint8Array {
  return Buffer.from([...headers, '', body].join('\r\n'), 'utf8');
}

function parse(raw: Uint8Array, overrides: Partial<{ from: string; to: string }> = {}) {
  return parseFounderSignalReviewEmail(
    {
      from: overrides.from ?? 'Juss Ray <juss@example.com>',
      to: overrides.to ?? recipient,
      raw,
    },
    options,
  );
}

describe('Founder Signal review email parser', () => {
  it('parses plaintext into a deterministic unresolved intake receipt', () => {
    const raw = rawEmail(
      [
        'From: Juss Ray <juss@example.com>',
        `To: ${recipient}`,
        'Message-ID: <review-1@example.com>',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
      ],
      'cancel all\r\n\r\nOn Sun, Aug 2, 2026 Founder Signal wrote:\r\n> quoted history',
    );

    const first = parse(raw);
    const second = parse(raw);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 1,
      replyContextId: contextId,
      commandType: 'cancel_all',
      targetChannel: null,
      commandText: 'cancel all',
      senderAddressMatched: true,
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
      providerActionsRequested: 0,
      source: 'cloudflare_email_routing',
      receivedAt: '2026-08-02T21:05:00.000Z',
    });
    expect(first.ingressId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.messageRefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.rawMessageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(first)).not.toContain('senderVerified');
    expect(JSON.stringify(first)).not.toContain('juss@example.com');
    expect(JSON.stringify(first)).not.toContain('quoted history');
  });

  it('binds replay identity to both Message-ID and raw bytes', () => {
    const headers = [
      'From: juss@example.com',
      `To: ${recipient}`,
      'Message-ID: <shared-message-id@example.com>',
      'Content-Type: text/plain; charset=utf-8',
    ];
    const cancel = parse(rawEmail(headers, 'cancel all'));
    const edit = parse(rawEmail(headers, 'juss_rayy_linkedin: make it shorter'));

    expect(cancel.messageRefHash).not.toBe(edit.messageRefHash);
    expect(cancel.ingressId).not.toBe(edit.ingressId);
  });

  it('parses multipart quoted-printable edit copy and ignores HTML', () => {
    const boundary = 'review-boundary-123';
    const raw = rawEmail(
      [
        'From: juss@example.com',
        `To: ${recipient}`,
        'Message-ID: <review-2@example.com>',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ],
      [
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'juss_rayy_linkedin: make the proof line more direct=0A=0ASent from my iPhone',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>attacker_channel: cancel</p>',
        `--${boundary}--`,
      ].join('\r\n'),
    );

    expect(parse(raw)).toMatchObject({
      commandType: 'edit_one',
      targetChannel: 'juss_rayy_linkedin',
      commandText: 'juss_rayy_linkedin: make the proof line more direct',
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
    });
  });

  it('parses a base64 channel cancellation', () => {
    const command = 'juss_beautiful_hair_facebook: cancel\r\n';
    const raw = rawEmail(
      [
        'From: juss@example.com',
        `To: ${recipient}`,
        'Message-ID: <review-3@example.com>',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
      ],
      Buffer.from(command, 'utf8').toString('base64'),
    );

    expect(parse(raw)).toMatchObject({
      commandType: 'cancel_one',
      targetChannel: 'juss_beautiful_hair_facebook',
      commandText: 'juss_beautiful_hair_facebook: cancel',
    });
  });

  it('rejects sender, recipient, and context mismatches', () => {
    const raw = rawEmail(['Content-Type: text/plain; charset=utf-8'], 'cancel all');

    expect(() => parse(raw, { from: 'attacker@example.com' })).toThrowError(
      new FounderSignalReviewEmailError('founder_sender_mismatch'),
    );
    expect(() => parse(raw, { to: 'review+not-a-uuid@foundercontrolroom.org' })).toThrowError(
      new FounderSignalReviewEmailError('invalid_reply_context'),
    );
    expect(() => parse(raw, { to: `review+${contextId}@example.com` })).toThrowError(
      new FounderSignalReviewEmailError('unexpected_recipient_domain'),
    );
  });

  it('rejects HTML-only mail and attachment-shaped plaintext', () => {
    const htmlOnly = rawEmail(
      ['Content-Type: text/html; charset=utf-8'],
      '<p>cancel all</p>',
    );
    expect(() => parse(htmlOnly)).toThrowError(
      new FounderSignalReviewEmailError('text_plain_body_required'),
    );

    for (const headers of [
      [
        'Content-Type: text/plain; charset=utf-8',
        'Content-Disposition: attachment; filename="command.txt"',
      ],
      [
        'Content-Type: text/plain; charset=utf-8; name="command.txt"',
        'Content-Disposition: inline; filename="command.txt"',
      ],
    ]) {
      expect(() => parse(rawEmail(headers, 'cancel all'))).toThrowError(
        new FounderSignalReviewEmailError('text_plain_body_required'),
      );
    }
  });

  it('rejects quoted-only, ambiguous, and unscoped commands', () => {
    expect(() => extractFounderReviewCommand('> cancel all\n> quoted only')).toThrowError(
      new FounderSignalReviewEmailError('missing_unquoted_command'),
    );
    expect(() => extractFounderReviewCommand('cancel all\njuss_rayy_linkedin: cancel')).toThrowError(
      new FounderSignalReviewEmailError('multiple_unquoted_commands'),
    );
    expect(() => extractFounderReviewCommand('make it shorter')).toThrowError(
      new FounderSignalReviewEmailError('channel_required'),
    );
  });

  it('rejects oversized raw messages before parsing', () => {
    const raw = new Uint8Array(128 * 1024 + 1);
    expect(() => parse(raw)).toThrowError(
      new FounderSignalReviewEmailError('raw_email_size_rejected'),
    );
  });

  it('rejects receipt authorization and command-semantic escalation', () => {
    const base = parse(rawEmail(
      [
        'From: juss@example.com',
        `To: ${recipient}`,
        'Message-ID: <review-4@example.com>',
        'Content-Type: text/plain; charset=utf-8',
      ],
      'juss_rayy_linkedin: cancel',
    ));

    expect(() => validateFounderSignalReviewEmailReceipt({
      ...base,
      executionAllowed: true,
    })).toThrowError(new FounderSignalReviewEmailReceiptError('execution_not_allowed'));

    expect(() => validateFounderSignalReviewEmailReceipt({
      ...base,
      authorizationState: 'authorized',
    })).toThrowError(new FounderSignalReviewEmailReceiptError('authorization_not_unresolved'));

    expect(() => validateFounderSignalReviewEmailReceipt({
      ...base,
      commandText: 'juss_rayy_linkedin: publish now',
    })).toThrowError(new FounderSignalReviewEmailReceiptError('command_semantics_mismatch'));

    expect(() => validateFounderSignalReviewEmailReceipt({
      ...base,
      commandType: 'edit_one',
      commandText: 'juss_rayy_linkedin: cancel',
    })).toThrowError(new FounderSignalReviewEmailReceiptError('command_semantics_mismatch'));
  });
});
