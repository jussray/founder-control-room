import { describe, expect, it, vi } from 'vitest';
import { executeBufferEditorialDraft } from '../bufferEditorialDraftRuntime.js';

const SHA = '205a239486b6b542648ce2f125178814e358b816';
const INVOCATION = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const BATCH = '66cf315f-e1a0-4aad-9c76-355f1df30b54';
const GENERATED = '2026-10-29T23:00:00.000Z';

function input() {
  return {
    post_text: 'Juss & Co. draft runtime proof keeps provider execution separated from publication authority and preserves founder review before anything can go live.',
    content_field: 'facebook_brand_draft',
    destination_mode: 'draft',
    publish_allowed: false,
    proof_url: 'https://foundercontrolroom.org',
    source_commit_sha: SHA,
    channel: 'juss_and_co_facebook',
    batch_id: BATCH,
    batch_size: 1,
    batch_index: 1,
    invocation_id: INVOCATION,
    steering_grant_id: 'founder-draft-review-v1',
    founder_approval_id: `standing-policy:founder-draft-review-v1:${INVOCATION}`,
    authorization_mode: 'standing-policy',
    schedule_policy_id: 'buffer-draft-review-v1',
    notification_mode: 'gmail_campaign_digest',
    generated_at: GENERATED,
  };
}

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buffer editorial draft runtime', () => {
  it('routes an approved logical channel to Buffer and preserves draft-only truth', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        createPost: {
          post: {
            id: 'dddddddddddddddddddddddd',
            text: input().post_text,
            channelId: '6a5f0c94e2638b94d7a79168',
            status: 'draft',
            allowedActions: ['editPost'],
          },
        },
      }))
      .mockResolvedValueOnce(response({
        post: {
          id: 'dddddddddddddddddddddddd',
          text: input().post_text,
          channelId: '6a5f0c94e2638b94d7a79168',
          status: 'draft',
          allowedActions: ['editPost'],
        },
      }));

    const receipt = await executeBufferEditorialDraft(input(), {
      env: { BUFFER_API_KEY: 'test-buffer-key-never-log-this' },
      now: '2026-10-29T23:01:00.000Z',
      fetchImpl,
    });

    expect(receipt).toMatchObject({
      provider: 'buffer',
      state: 'BUFFER_ACCEPTED_DRAFT',
      logicalChannel: 'juss_and_co_facebook',
      providerChannelId: '6a5f0c94e2638b94d7a79168',
      service: 'facebook',
      status: 'draft',
      publishAllowed: false,
      scheduleAllowed: false,
      providerAcceptanceIsPublished: false,
      sourceCommitSha: SHA,
      invocationId: INVOCATION,
    });

    const createBody = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(createBody.variables.input).toMatchObject({
      channelId: '6a5f0c94e2638b94d7a79168',
      schedulingType: 'automatic',
      mode: 'addToQueue',
      saveToDraft: true,
    });
    expect(createBody.variables.input).not.toHaveProperty('dueAt');
  });

  it('fails before Buffer when the checked-in draft firewall is not satisfied', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const bad = input();
    bad.publish_allowed = true;

    await expect(executeBufferEditorialDraft(bad, {
      env: { BUFFER_API_KEY: 'test-buffer-key-never-log-this' },
      now: '2026-10-29T23:01:00.000Z',
      fetchImpl,
    })).rejects.toThrow(/FOUNDER_SIGNAL_CONTENT_REJECTED/);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when the server-side Buffer key is absent', async () => {
    await expect(executeBufferEditorialDraft(input(), {
      env: {},
      now: '2026-10-29T23:01:00.000Z',
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toThrow(/BUFFER_API_KEY_NOT_CONFIGURED/);
  });
});
