import { describe, expect, it } from 'vitest';
import {
  HANDSHAKE_PROJECTS,
  getHandshakeBrandSpec,
  prepareHandshakeBrandSocialDraft,
  type HandshakeDraftRequest,
  type HandshakeProject,
} from '../handshakeBrandSocial.js';

const COMMIT = 'a'.repeat(40);
const HASH = 'c'.repeat(64);
const COVER = 'd'.repeat(64);
const MEDIA_URL = 'https://cdn.jussco.company/handshake/fcr-cover.png';
function fixture(project: HandshakeProject): HandshakeDraftRequest {
  const spec = HANDSHAKE_PROJECTS[project];
  const proof = project === 'bip' ? 'https://sekretbip.net/' : 'https://github.com/' + spec.repository;
  const altText = spec.name + ' portfolio image with branded logo.';
  return {
    project,
    audience: spec.audience,
    businessAccountBindingVerified: true,
    evidence: {
      fullName: spec.repository, visibility: 'public', archived: false,
      exactHead: COMMIT, recentCommitCount: 4, recentMergedPullRequests: 2,
      policy: {
        containsMinorOrSensitiveData: project === 'bip',
        publicProofUrls: [proof], neverClaim: [],
        neverExpose: project === 'bip' ? ['teen records', 'private reflections'] : [],
      },
    },
    mediaReview: {
      project, logoRepository: spec.repository, logoPath: spec.logoPath,
      logoSha256: HASH, coverSha256: COVER,
      founderReviewedExactMediaSha256: COVER,
      founderReviewReceiptId: 'founder-review-2026-11-26',
      mediaUrl: MEDIA_URL, altText,
      dimensions: { width: 1536, height: 1024 }, publicReadbackVerified: true,
    },
    draft: {
      platform: 'facebook', accountId: 'verified_jussnco_business',
      text: 'What is ' + spec.name + '? It is a product project with repository-backed engineering evidence. Current functionality still needs live-path verification. Learn more: ' + proof,
      traction: 'Repository source is available for review, not a live-deployment receipt.',
      governanceAdvantage: 'Exact-source review and release boundaries are explicit.',
      audienceValue: 'Review public product intent and inspect real source evidence.',
      investorSignal: 'Verification is separate from authored material.',
      proofLinks: [{ label: 'Public product evidence', url: proof }],
      platformCharacterLimit: 2500,
    },
  };
}
describe('project-specific brand handoff', () => {
  it.each(['fcr', 'bip', 'sync'] as HandshakeProject[])('routes %s through the existing first-party draft and not Handshake submission', (project) => {
    const result = prepareHandshakeBrandSocialDraft(fixture(project));
    expect(result.socialInput.mode).toBe('draft');
    expect(result.socialInput.publishAllowed).toBe(false);
    expect(result.socialInput.founderApprovalId).toBeNull();
    expect(result.reviewedDraft.mode).toBe('draft');
    expect(result.reviewedDraft.sourceRepository).toBe(HANDSHAKE_PROJECTS[project].repository);
    expect(result.handshake.status).toBe('NOT_SUBMITTED');
    expect(getHandshakeBrandSpec(project).publishingEnabled).toBe(false);
  });
  it('blocks one product borrowing another logo', () => {
    const request = fixture('bip');
    request.mediaReview.logoRepository = 'jussray/founder-control-room';
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/cross-brand logo/);
  });
  it('blocks public posting against the wrong audience for Bip', () => {
    const request = fixture('bip');
    request.audience = 'business';
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/target audience/);
  });
  it('blocks visual candidate without exact founder-reviewed media hash', () => {
    const request = fixture('sync');
    request.mediaReview.founderReviewedExactMediaSha256 = HASH;
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/media hash/);
  });
  it('blocks unverified public media even when a local image exists', () => {
    const request = fixture('fcr');
    request.mediaReview.publicReadbackVerified = false;
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/readback/);
  });
  it('blocks personal account distribution', () => {
    const request = fixture('fcr');
    request.draft.accountId = '@juss_fn_ray';
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/personal account/);
  });
  it('preserves first-party fail-closed exact-SHA and output firewall', () => {
    const request = fixture('bip');
    request.evidence.exactHead = 'not-a-sha';
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/not eligible/);
    const unsafe = fixture('bip');
    unsafe.draft.text += ' teen records';
    expect(() => prepareHandshakeBrandSocialDraft(unsafe)).toThrow(/neverExpose/);
  });
  it('blocks media that was replaced after exact review', () => {
    const request = fixture('sync');
    request.draft.media = [{ type: 'image', url: 'https://other.example/ad.png', altText: 'another ad' }];
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/draft media must equal/);
  });
  it('blocks non-3:2 image', () => {
    const request = fixture('fcr');
    request.mediaReview.dimensions = { width: 1080, height: 1080 };
    expect(() => prepareHandshakeBrandSocialDraft(request)).toThrow(/3:2/);
  });
});
