import { describe, expect, it, vi } from 'vitest';
import {
  executeConfirmedBufferDraft,
  previewBufferDraft,
} from '../bufferPublishingRuntime.js';

const SHA = '205a239486b6b542648ce2f125178814e358b816';
const INVOCATION = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';

function input() {
  return {
    post_text: 'Juss & Co. draft runtime proof stays in review state and cannot schedule or publish until a separate founder action occurs.',
    content_field: 'facebook_brand_draft',
    destination_mode: 'draft',
    publish_allowed: false,
    proof_url: 'https://foundercontrolroom.org',
    source_commit_sha: SHA,
    channel: 'juss_and_co_facebook',
    batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
    batch_size: 1,
    batch_index: 1,
    invocation_id: INVOCATION,
    steering_grant_id: 'founder-draft-review-v1',
    founder_approval_id: `standing-policy:founder-draft-review-v1:${INVOCATION}`,
    authorization_mode: 'standing-policy',
    schedule_policy_id: 'buffer-draft-review-v1',
    notification_mode: 'gmail_campaign_digest',
    generated_at: '2026-10-29T23:00:00.000Z',
  };
}

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buffer publishing capability', () => {
  it('binds the proposal to founder, project, copy and provider channel', () => {
    const first = previewBufferDraft(
      input(),
      { userId: 'founder-1', email: 'founder@example.com' },
      'founder-control-room',
      '2026-10-29T23:01:00.000Z',
    );
    const changedProject = previewBufferDraft(
      input(),
      { userId: 'founder-1', email: 'founder@example.com' },
      'chief-ai-machine',
      '2026-10-29T23:01:00.000Z',
    );

    expect(first.publishAllowed).toBe(false);
    expect(first.scheduleAllowed).toBe(false);
    expect(first.projectSlug).toBe('founder-control-room');
    expect(changedProject.proposalHash).not.toBe(first.proposalHash);
  });

  it('rejects execution when founder confirmation is not bound to the exact proposal', async () => {
    await expect(executeConfirmedBufferDraft({
      input: input(),
      founder: { userId: 'founder-1', email: 'founder@example.com' },
      projectSlug: 'founder-control-room',
      proposalHash: 'sha256:' + '0'.repeat(64),
      confirmDraft: true,
      now: '2026-10-29T23:01:00.000Z',
      env: { BUFFER_API_KEY: 'test-buffer-key-never-log-this' },
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toThrow(/PROPOSAL_HASH_MISMATCH/);
  });

  it('executes the exact confirmed proposal only as a Buffer draft', async () => {
    const proposal = previewBufferDraft(
      input(),
      { userId: 'founder-1', email: 'founder@example.com' },
      'founder-control-room',
      '2026-10-29T23:01:00.000Z',
    );
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

    const executed = await executeConfirmedBufferDraft({
      input: input(),
      founder: { userId: 'founder-1', email: 'founder@example.com' },
      projectSlug: 'founder-control-room',
      proposalHash: proposal.proposalHash,
      confirmDraft: true,
      now: '2026-10-29T23:01:00.000Z',
      env: { BUFFER_API_KEY: 'test-buffer-key-never-log-this' },
      fetchImpl,
    });

    expect(executed.receipt).toMatchObject({
      state: 'BUFFER_ACCEPTED_DRAFT',
      status: 'draft',
      publishAllowed: false,
      scheduleAllowed: false,
      providerAcceptanceIsPublished: false,
    });
  });
});
