import { describe, expect, it } from 'vitest';
import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  FIRST_PARTY_SOCIAL_PLATFORMS,
  FirstPartySocialPublisherError,
  executeFirstPartyPublication,
  validateFirstPartySocialPost,
  type FirstPartyPublicationReceipt,
  type FirstPartySocialPostInput,
} from '../firstPartySocialPublisher.js';

const SHA = '48af806a3b2d7cfccf874268f964fbfed6272cb6';
const PROOF_URL = 'https://github.com/jussray/founder-control-room/pull/183';

function input(overrides: Partial<FirstPartySocialPostInput> = {}): FirstPartySocialPostInput {
  return {
    platform: 'linkedin',
    accountId: 'urn:li:person:ray',
    contentField: 'linkedin_draft',
    text:
      `We shipped a proof-gated publishing boundary that keeps prompts out of public posts. ` +
      `The governance advantage is simple: no success claim without a platform receipt. ` +
      `Investors can inspect the implementation here: ${PROOF_URL}`,
    traction: 'A proof-gated publishing boundary is implemented.',
    governanceAdvantage: 'No success claim is accepted without a verified platform receipt.',
    audienceValue: 'Followers receive finished, source-backed updates instead of automation prompts.',
    investorSignal: 'The system turns operating discipline into a defensible distribution advantage.',
    proofLinks: [{ label: 'Implementation proof', url: PROOF_URL }],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: SHA,
    mode: 'publish',
    publishAllowed: true,
    founderApprovalId: 'founder-approval:post-001',
    media: [],
    ...overrides,
  };
}

describe('first-party social publisher', () => {
  it('covers every owned social output lane in one registry', () => {
    expect(Object.keys(FIRST_PARTY_PLATFORM_CAPABILITIES).sort()).toEqual(
      [...FIRST_PARTY_SOCIAL_PLATFORMS].sort(),
    );
  });

  it('prepares a LinkedIn post with traction, governance, investor signal, and proof', () => {
    const prepared = validateFirstPartySocialPost(input());

    expect(prepared.platform).toBe('linkedin');
    expect(prepared.characterLimit).toBe(2900);
    expect(prepared.proofUrls).toEqual([PROOF_URL]);
    expect(prepared.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects posts that omit governance advantage or clickable proof', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({
          governanceAdvantage: '',
          proofLinks: [],
          text: 'This finished post is intentionally long enough but has no public evidence URL attached.',
        }),
      ),
    ).toThrowError(FirstPartySocialPublisherError);
  });

  it('keeps LinkedIn copy below the configured safety ceiling', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({ text: `${'a'.repeat(2901)} ${PROOF_URL}` }),
      ),
    ).toThrow('text exceeds the configured linkedin limit of 2900 characters');
  });

  it('blocks queue or publish when founder authority is absent', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({ publishAllowed: false, founderApprovalId: null }),
      ),
    ).toThrow('queue or publish mode requires publishAllowed=true');
  });

  it('rejects prompt leakage even when the transport fields look complete', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({
          text:
            `You are writing for LinkedIn. Return exactly one valid JSON object. ` +
            `Proof: ${PROOF_URL}`,
        }),
      ),
    ).toThrow('text resembles instructions, a prompt, or unresolved automation input');
  });

  it('requires media and an explicit platform limit for Instagram', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({
          platform: 'instagram',
          accountId: 'ig-professional-account',
          contentField: 'instagram_draft',
          platformCharacterLimit: 2100,
          media: [],
        }),
      ),
    ).toThrow('instagram requires at least one media asset');
  });

  it('blocks provider-review platforms from live publication until approval is proven', () => {
    expect(() =>
      validateFirstPartySocialPost(
        input({
          platform: 'tiktok',
          accountId: 'tiktok-creator',
          contentField: 'tiktok_caption',
          platformCharacterLimit: 2000,
          media: [{ type: 'video', url: 'https://sekretbip.net/proof/demo.mp4' }],
        }),
      ),
    ).toThrow('tiktok remains blocked until provider review is verified');
  });

  it('accepts publication only after the adapter returns a matching platform receipt', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const receipt: FirstPartyPublicationReceipt = {
      platform: 'linkedin',
      externalPostId: 'urn:li:share:123',
      permalink: 'https://www.linkedin.com/feed/update/urn:li:share:123/',
      providerRequestId: 'request-123',
      publishedAt: '2026-07-31T21:30:00.000Z',
      contentHash: prepared.contentHash,
      sourceCommitSha: prepared.sourceCommitSha,
      proofUrls: prepared.proofUrls,
    };

    await expect(
      executeFirstPartyPublication(prepared, {
        linkedin: {
          platform: 'linkedin',
          publish: async () => receipt,
        },
      }),
    ).resolves.toEqual(receipt);
  });

  it('rejects success receipts that do not match the published content', async () => {
    const prepared = validateFirstPartySocialPost(input());

    await expect(
      executeFirstPartyPublication(prepared, {
        linkedin: {
          platform: 'linkedin',
          publish: async () => ({
            platform: 'linkedin',
            externalPostId: 'urn:li:share:wrong',
            permalink: 'https://www.linkedin.com/feed/update/urn:li:share:wrong/',
            providerRequestId: null,
            publishedAt: '2026-07-31T21:30:00.000Z',
            contentHash: 'wrong-content-hash',
            sourceCommitSha: prepared.sourceCommitSha,
            proofUrls: prepared.proofUrls,
          }),
        },
      }),
    ).rejects.toThrow('receipt contentHash does not match');
  });
});
