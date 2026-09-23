const {
  buildFacebookWorldObservation,
  validateWorldObservationReceipt,
} = require('../../../tools/founder-content-contracts/facebook-world-adapter-contract.cjs') as {
  buildFacebookWorldObservation: (input: Record<string, unknown>, now?: Date) => any;
  validateWorldObservationReceipt: (receipt: Record<string, unknown>) => { valid: boolean; errors: string[] };
};

describe('Facebook world observation contract', () => {
  it('keeps platform and founder success separate while preserving revenue lanes', () => {
    const receipt = buildFacebookWorldObservation({
      workspaceId: 'founder',
      projectId: 'facebook-growth',
      experimentId: 'fb-0042',
      contentId: 'facebook-post-99',
      format: 'reel',
      contentFingerprint: 'content-fingerprint-99',
      predictionReceiptId: 'world-prediction-fb-0042',
      metrics: {
        reach: 12000,
        qualifiedViews: 8400,
        nonQualifiedViews: 700,
        watchTimeSeconds: 210000,
        engagements: 640,
        followerDelta: 88,
        profileActions: 118,
        clicks: 42,
        conversions: 4,
      },
      money: {
        currency: 'USD',
        platformContentRevenueCents: 1200,
        starsRevenueCents: 700,
        attributableProductRevenueCents: 3500,
        partnershipRevenueCents: 0,
      },
      assessments: {
        platform: 'passed',
        founder: 'unknown',
      },
      sourceRefs: ['facebook://insights/post-99', 'metricool://post-99'],
      observedAt: '2026-09-23T02:30:00.000Z',
    }, new Date('2026-09-23T02:40:00.000Z'));

    expect(validateWorldObservationReceipt(receipt)).toEqual({ valid: true, errors: [] });
    expect(receipt.platform).toBe('facebook');
    expect(receipt.assessments.platform).toBe('passed');
    expect(receipt.assessments.founder).toBe('unknown');
    expect(receipt.money.platformContentRevenueCents).toBe(1200);
    expect(receipt.money.starsRevenueCents).toBe(700);
    expect(receipt.money.attributableProductRevenueCents).toBe(3500);
    expect(receipt.authority.permitsPublishing).toBe(false);
  });

  it('fails closed without source receipts', () => {
    expect(() => buildFacebookWorldObservation({
      experimentId: 'fb-0043',
      contentId: 'facebook-post-100',
      sourceRefs: [],
    })).toThrow('at least one source receipt');
  });
});
