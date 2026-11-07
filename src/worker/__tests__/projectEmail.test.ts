import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  FCR_EMAIL_FROM,
  sendFounderControlRoomEmail,
  type ProjectEmailBinding,
} from '../projectEmail.js';

function binding(result: { messageId: string } = { messageId: 'cf-email-id' }) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, value: { send } satisfies ProjectEmailBinding };
}

describe('Founder Control Room outbound email boundary', () => {
  it('pins the FCR sender while allowing caller-owned recipient and content', async () => {
    const email = binding();

    await expect(sendFounderControlRoomEmail(email.value, {
      to: 'recipient@example.com',
      subject: 'Welcome to Founder Control Room',
      html: '<h1>Welcome</h1>',
      text: 'Welcome',
    })).resolves.toBe('cf-email-id');

    expect(email.send).toHaveBeenCalledWith({
      to: 'recipient@example.com',
      from: FCR_EMAIL_FROM,
      subject: 'Welcome to Founder Control Room',
      html: '<h1>Welcome</h1>',
      text: 'Welcome',
    });
  });

  it('does not allow a copied project sender to override the FCR identity', async () => {
    const email = binding();

    await sendFounderControlRoomEmail(email.value, {
      to: 'recipient@example.com',
      subject: 'Scoped sender',
      text: 'Protected',
      from: 'welcome@sekretbip.net',
    } as Parameters<typeof sendFounderControlRoomEmail>[1] & { from: string });

    expect(email.send).toHaveBeenCalledWith({
      to: 'recipient@example.com',
      from: FCR_EMAIL_FROM,
      subject: 'Scoped sender',
      text: 'Protected',
    });
  });

  it('fails closed on missing recipient, subject, body, or provider receipt', async () => {
    const email = binding();

    await expect(sendFounderControlRoomEmail(email.value, {
      to: ' ',
      subject: 'Subject',
      text: 'Body',
    })).rejects.toThrow('fcr_email_missing_recipient');

    await expect(sendFounderControlRoomEmail(email.value, {
      to: 'recipient@example.com',
      subject: ' ',
      text: 'Body',
    })).rejects.toThrow('fcr_email_missing_subject');

    await expect(sendFounderControlRoomEmail(email.value, {
      to: 'recipient@example.com',
      subject: 'Subject',
    })).rejects.toThrow('fcr_email_missing_body');

    await expect(sendFounderControlRoomEmail(binding({ messageId: ' ' }).value, {
      to: 'recipient@example.com',
      subject: 'Subject',
      text: 'Body',
    })).rejects.toThrow('fcr_email_missing_message_id');
  });

  it('keeps Wrangler project-scoped instead of exposing a generic EMAIL binding', () => {
    const wrangler = readFileSync(new URL('../../../wrangler.worker.toml', import.meta.url), 'utf8');

    expect(wrangler).toContain('name = "FCR_EMAIL"');
    expect(wrangler).toContain(`allowed_sender_addresses = ["${FCR_EMAIL_FROM}"]`);
    expect(wrangler).toContain(`FCR_EMAIL_FROM = "${FCR_EMAIL_FROM}"`);
    expect(wrangler).not.toContain('name = "EMAIL"');
    expect(wrangler).not.toContain('welcome@www.foundercontrolroom.org');
  });
});
