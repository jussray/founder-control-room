import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_USE_DIGEST_RECIPIENT,
  EXTERNAL_USE_EMAIL_OUTCOME_UNKNOWN,
  retryExternalUseDigest,
  sendExternalUseDigest,
} from './digestDelivery.js';

describe('external-use digest delivery', () => {
  it('sends through the existing founder-scoped Cloudflare email binding', async () => {
    const send = vi.fn(async () => ({ messageId: 'mail-123' }));
    const id = await sendExternalUseDigest({ send }, {
      subject: 'External-use discovery',
      html: '<p>Verified source links</p>',
      text: 'Verified source links',
    });
    expect(id).toBe('mail-123');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      to: EXTERNAL_USE_DIGEST_RECIPIENT,
      from: 'welcome@api.foundercontrolroom.org',
      subject: 'External-use discovery',
      html: '<p>Verified source links</p>',
      text: 'Verified source links',
    });
  });

  it('does not silently count an unacknowledged provider send as successful', async () => {
    const send = vi.fn(async () => ({ messageId: '' }));
    await expect(sendExternalUseDigest({ send }, {
      subject: 'External-use discovery',
      text: 'Verified source links',
    })).rejects.toThrow('fcr_email_missing_message_id');
  });

  it('retries pre-send failures but never automatically retries an uncertain send', () => {
    expect(retryExternalUseDigest('failed', null)).toBe(10 * 60_000);
    expect(retryExternalUseDigest('running', null)).toBe(20 * 60_000);
    expect(retryExternalUseDigest('failed', EXTERNAL_USE_EMAIL_OUTCOME_UNKNOWN)).toBeUndefined();
    expect(retryExternalUseDigest('running', EXTERNAL_USE_EMAIL_OUTCOME_UNKNOWN)).toBeUndefined();
    expect(retryExternalUseDigest('sent', null)).toBeUndefined();
  });
});
