import { describe, expect, it } from 'vitest';
import { reviewFounderSignalDraftHandoff } from '../founderSignalDraftHandoff.js';

const SHA = 'a'.repeat(40);
const MEDIA_SHA = 'b'.repeat(64);
const CAMPAIGN = {
  source: {
    repository: 'jussray/founder-control-room',
    commitSha: SHA,
    proofUrl: 'https://github.com/jussray/founder-control-room/commit/' + SHA,
    visibility: 'public',
  },
  strategy: {
    intent: 'proof-update',
    audience: 'Practical operators and builders',
    observation: 'Good systems show their limits instead of hiding them.',
    fact: 'The project contains a review-only draft gate tied to a source commit.',
    audienceValue: 'Builders can inspect a claim before depending on it.',
    truthBoundary: 'This source claim has not been independently verified by the draft planner.',
    callToAction: 'What would you verify next?',
    thesis: 'Transparent proof is a better long-term strategy',
  },
  topics: ['BuildInPublic', 'FounderTech', 'CreativeProcess', 'DevTools', 'Transparency'],
  platforms: ['linkedin', 'instagram', 'youtube'],
};
const media = (type: 'image' | 'video' = 'image') => ({
  type,
  url: 'https://cdn.example.org/public/asset-01.' + (type === 'video' ? 'mp4' : 'png'),
  sha256: MEDIA_SHA,
  altText: 'A labelled, accessible illustration of a source-bound verification gate.',
  rights: { basis: 'original', receiptUrl: 'https://rights.example.org/public/receipt-01', permissionGranted: true },
  visualVerdict: {
    contract: 'juss/visual-wonder-artifact-verdict',
    state: 'PASSED',
    artifactSha256: MEDIA_SHA,
  },
});
const proposal = (overrides: Record<string, unknown> = {}) => ({
  campaign: CAMPAIGN, platform: 'linkedin', accountId: 'founder-profile-01', media: [media()], ...overrides,
});

describe('Founder Signal read-only draft handoff preview', () => {
  it('previews the exact canonical first-party draft shape without granting provider authority', () => {
    const x=reviewFounderSignalDraftHandoff(proposal());
    expect(x.contract).toBe('fcr/founder-signal-draft-handoff@v1');
    expect(x.status).toBe('LOCAL_DRAFT_SHAPE_VALID__PROVIDER_UNVERIFIED');
    expect(x.evidenceClass).toBe('SELF_ATTESTED_NOT_PROVIDER_VERIFIED');
    expect(x.preview?.mode).toBe('draft');
    expect(x.preview?.contentField).toBe('linkedin_draft');
    expect(x.preview?.sourceCommitSha).toBe(SHA);
    expect(x.preview?.media).toHaveLength(1);
    expect(x.authority.canCreateLocalDraft).toBe(false);
    expect(x.authority.canCreateBufferDraft).toBe(false);
    expect(x.authority.canPublish).toBe(false);
    expect(x.handoffReady).toBe(false);
    expect(x.founderApprovalVerified).toBe(false);
    expect(x.renderedMediaBytesChecked).toBe(false);
    expect(x.handoffFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reviews video platform drafts with a media asset and declared native limit', () => {
    const x=reviewFounderSignalDraftHandoff(proposal({
      platform:'youtube', accountId:'channel-01', platformCharacterLimit:3000, media:[media('video')],
    }));
    expect(x.status).toBe('LOCAL_DRAFT_SHAPE_VALID__PROVIDER_UNVERIFIED');
    expect(x.preview?.contentField).toBe('youtube_shorts_draft');
    expect(x.preview?.media).toHaveLength(1);
    expect(x.accountOwnershipVerified).toBe(false);
  });

  it('cannot override a known native safe limit with a caller-supplied larger limit', () => {
    expect(() => reviewFounderSignalDraftHandoff(proposal({platformCharacterLimit:5000})))
      .toThrow(/cannot override the platform hard safe limit/);
  });

  it('holds an unrendered image/video plan and excludes draft envelope', () => {
    const x=reviewFounderSignalDraftHandoff(proposal({media:[]}));
    expect(x.status).toBe('HOLD');
    expect(x.issues).toContain('RENDERED_MEDIA_NOT_SUPPLIED');
    expect(x.preview).toBeNull();
  });

  it('holds missing rights, unverifiable visual verdict and inconsistent artifact fingerprint', () => {
    const asset=media();
    const bad={...asset,visualVerdict:{...asset.visualVerdict,artifactSha256:'c'.repeat(64)},
      rights:{...asset.rights,permissionGranted:false}};
    const x=reviewFounderSignalDraftHandoff(proposal({media:[bad]}));
    expect(x.status).toBe('HOLD');
    expect(x.issues).toContain('MEDIA_RIGHTS_UNVERIFIED_0');
    expect(x.issues).toContain('MEDIA_VISUAL_VERDICT_MISSING_OR_MISMATCH_0');
  });

  it('does not accept private network or tokenized/signed media URLs', () => {
    const bad=media();
    const x=reviewFounderSignalDraftHandoff(proposal({media:[{...bad,url:'https://cdn.example.org/image.png?token=secret'}]}));
    expect(x.status).toBe('HOLD');
    expect(x.issues).toContain('MEDIA_URL_NOT_PUBLIC_SAFE_0');
    const y=reviewFounderSignalDraftHandoff(proposal({media:[{...bad,url:'https://127.0.0.1/image.png'}]}));
    expect(y.status).toBe('HOLD');
  });

  it('does not silently bypass reputation or repetition holds', () => {
    const sensitive={
      ...CAMPAIGN,
      strategy:{...CAMPAIGN.strategy, fact:'We have 500 customers and a guaranteed investor partnership'},
    };
    const x=reviewFounderSignalDraftHandoff(proposal({campaign:sensitive}));
    expect(x.status).toBe('HOLD');
    expect(x.issues).toContain('HOLD_ORIGINAL_CAMPAIGN_HOLD_REPUTATION_REVIEW');
  });

  it('requires an account-specific character limit where the platform contract lacks one', () => {
    const x=reviewFounderSignalDraftHandoff(proposal({platform:'instagram',accountId:'ig-01',media:[media('video')]}));
    expect(x.status).toBe('HOLD');
    expect(x.issues).toContain('ACCOUNT_NATIVE_CHARACTER_LIMIT_NOT_VERIFIED');
  });

  it('rejects forged approval and unrelated campaign or media properties', () => {
    expect(()=>reviewFounderSignalDraftHandoff(proposal({founderApprovalId:'approved'})))
      .toThrow(/unexpected handoff property/);
    expect(()=>reviewFounderSignalDraftHandoff(proposal({campaign:{...CAMPAIGN,approved:true}})))
      .toThrow(/Unexpected campaign field/);
    expect(()=>reviewFounderSignalDraftHandoff(proposal({media:[{...media(),publishAllowed:true}]})))
      .toThrow(/unexpected media property/);
  });

  it('rejects unapproved platform, account metadata and status promotion', () => {
    expect(()=>reviewFounderSignalDraftHandoff(proposal({platform:'unknown'})))
      .toThrow(/unsupported platform/);
    expect(()=>reviewFounderSignalDraftHandoff(proposal({accountId:'Bearer secret-access-token'})))
      .toThrow(/account identifier invalid/);
    const x=reviewFounderSignalDraftHandoff(proposal());
    expect(x.providerDeliveryObserved).toBe(false);
    expect(x.authority.canSchedule).toBe(false);
    expect(x.authority.canMutateHubSpot).toBe(false);
  });
});
