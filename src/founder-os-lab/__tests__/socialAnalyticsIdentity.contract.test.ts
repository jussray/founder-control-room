import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8'),
) as {
  socialAnalyticsTruth: {
    measurementIdentityRequiredForLearning: boolean;
    measurementIdentityFields: string[];
    wrongAccountEvidenceClassifyAs: string;
    exactPostIdentityRequiredForPostVerdict: boolean;
    accountLevelAggregateMayScorePostExperiment: boolean;
    publishingReceiptMayScorePerformance: boolean;
    providerZerosWithoutAnalyticsAuthorityMayScoreAsZero: boolean;
  };
};

describe('social analytics exact-identity contract', () => {
  it('requires exact platform/account/post/experiment binding before learning', () => {
    expect(manifest.socialAnalyticsTruth.measurementIdentityRequiredForLearning).toBe(true);
    expect(manifest.socialAnalyticsTruth.measurementIdentityFields).toEqual([
      'platform',
      'account',
      'post',
      'experiment',
    ]);
    expect(manifest.socialAnalyticsTruth.wrongAccountEvidenceClassifyAs).toBe(
      'BLOCKED_IDENTITY_MISMATCH',
    );
    expect(manifest.socialAnalyticsTruth.exactPostIdentityRequiredForPostVerdict).toBe(true);
  });

  it('forbids weaker receipts from scoring post performance', () => {
    expect(manifest.socialAnalyticsTruth.accountLevelAggregateMayScorePostExperiment).toBe(false);
    expect(manifest.socialAnalyticsTruth.publishingReceiptMayScorePerformance).toBe(false);
    expect(manifest.socialAnalyticsTruth.providerZerosWithoutAnalyticsAuthorityMayScoreAsZero).toBe(false);
  });
});
