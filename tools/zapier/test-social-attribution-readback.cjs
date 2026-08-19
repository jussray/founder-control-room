'use strict';

const assert = require('node:assert/strict');
const { evaluateSocialAttributionReadback } = require('./social-attribution-readback.cjs');

const contentId = '82a030bd-cd2c-4d72-96c9-b38746bc1380';
const distributionEnvelope = {
  version: 1,
  lane: 'first_party_founder_governed_schedule',
  platform: 'linkedin',
  content_id: contentId,
  source: {
    repo: 'jussray/founder-control-room',
    commit_sha: 'a'.repeat(40),
    proof_url: 'https://github.com/jussray/founder-control-room/commit/example',
  },
  attribution: {
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'fcr-build-in-public',
    utm_content: contentId,
  },
};

const zeroBaseline = evaluateSocialAttributionReadback({
  observed_at: '2026-08-18T21:00:00-04:00',
  distribution_envelope: distributionEnvelope,
  contacts: [],
  attribution_evidence: [],
  baseline: {
    social_source_observed_contacts: 0,
    exact_attributed_contacts: 0,
  },
});
assert.equal(zeroBaseline.state, 'baseline-zero');
assert.equal(zeroBaseline.metrics.social_source_observed_contacts, 0);
assert.equal(zeroBaseline.metrics.exact_attributed_contacts, 0);
assert.equal(zeroBaseline.claims.social_source_observed, false);
assert.equal(zeroBaseline.claims.exact_campaign_content_attribution_observed, false);
assert.equal(zeroBaseline.claims.social_source_fields_alone_prove_exact_post_attribution, false);
assert.equal(zeroBaseline.source.external_write_included, false);
assert.equal(zeroBaseline.evidence_boundaries.analytics_can_authorize_publish, false);

const sourceOnly = evaluateSocialAttributionReadback({
  observed_at: '2026-08-18T21:05:00-04:00',
  distribution_envelope: distributionEnvelope,
  contacts: [
    {
      id: '1001',
      properties: {
        hs_analytics_source: 'SOCIAL_MEDIA',
        hs_latest_source: 'DIRECT_TRAFFIC',
        num_associated_deals: '0',
      },
    },
  ],
  attribution_evidence: [],
  baseline: {
    social_source_observed_contacts: 0,
    exact_attributed_contacts: 0,
  },
});
assert.equal(sourceOnly.state, 'social-source-observed');
assert.equal(sourceOnly.metrics.social_source_observed_contacts, 1);
assert.equal(sourceOnly.metrics.social_source_delta_from_baseline, 1);
assert.equal(sourceOnly.metrics.exact_attributed_contacts, 0);
assert.equal(sourceOnly.claims.social_source_observed, true);
assert.equal(sourceOnly.claims.exact_campaign_content_attribution_observed, false);
assert.equal(sourceOnly.claims.exact_attributed_pipeline_observed, false);

const exactPipeline = evaluateSocialAttributionReadback({
  observed_at: '2026-08-18T21:10:00-04:00',
  distribution_envelope: distributionEnvelope,
  contacts: [
    {
      id: '1001',
      properties: {
        hs_analytics_source: 'SOCIAL_MEDIA',
        hs_latest_source: 'SOCIAL_MEDIA',
        num_associated_deals: '2',
      },
    },
    {
      id: '1002',
      properties: {
        hs_analytics_source: 'DIRECT_TRAFFIC',
        hs_latest_source: 'PAID_SOCIAL',
        num_associated_deals: '0',
      },
    },
  ],
  attribution_evidence: [
    {
      contact_id: '1001',
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'fcr-build-in-public',
      utm_content: contentId,
      evidence_ref: 'first-party-analytics:event-1001',
    },
  ],
  baseline: {
    social_source_observed_contacts: 0,
    exact_attributed_contacts: 0,
  },
});
assert.equal(exactPipeline.state, 'exact-attributed-pipeline-observed');
assert.equal(exactPipeline.metrics.social_source_observed_contacts, 2);
assert.equal(exactPipeline.metrics.social_source_observed_contacts_with_deals, 1);
assert.equal(exactPipeline.metrics.exact_attributed_contacts, 1);
assert.equal(exactPipeline.metrics.exact_attributed_contacts_with_deals, 1);
assert.equal(exactPipeline.claims.exact_campaign_content_attribution_observed, true);
assert.equal(exactPipeline.claims.exact_attributed_pipeline_observed, true);

const rejectedMismatch = evaluateSocialAttributionReadback({
  observed_at: '2026-08-18T21:15:00-04:00',
  distribution_envelope: distributionEnvelope,
  contacts: [
    {
      id: '1003',
      properties: {
        hs_analytics_source: 'SOCIAL_MEDIA',
        hs_latest_source: 'SOCIAL_MEDIA',
        num_associated_deals: '1',
      },
    },
  ],
  attribution_evidence: [
    {
      contact_id: '1003',
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'different-campaign',
      utm_content: contentId,
      evidence_ref: 'first-party-analytics:event-1003',
    },
  ],
});
assert.equal(rejectedMismatch.state, 'social-source-observed');
assert.equal(rejectedMismatch.metrics.social_source_observed_contacts, 1);
assert.equal(rejectedMismatch.metrics.exact_attributed_contacts, 0);
assert.equal(rejectedMismatch.metrics.rejected_attribution_evidence, 1);
assert.deepEqual(rejectedMismatch.rejected_evidence[0].failures, ['campaign_mismatch']);
assert.equal(rejectedMismatch.claims.exact_campaign_content_attribution_observed, false);

const duplicateRows = evaluateSocialAttributionReadback({
  observed_at: '2026-08-18T21:20:00-04:00',
  distribution_envelope: distributionEnvelope,
  contacts: [
    { id: '1004', properties: { hs_analytics_source: 'SOCIAL_MEDIA', num_associated_deals: '0' } },
    { id: '1004', properties: { hs_latest_source: 'SOCIAL_MEDIA', num_associated_deals: '0' } },
  ],
});
assert.equal(duplicateRows.metrics.social_source_observed_contacts, 1);
assert.equal(duplicateRows.metrics.duplicate_contact_rows, 1);

assert.throws(
  () => evaluateSocialAttributionReadback({
    observed_at: '2026-08-18T21:25:00-04:00',
    distribution_envelope: {
      ...distributionEnvelope,
      attribution: { ...distributionEnvelope.attribution, utm_content: 'wrong-content-id' },
    },
  }),
  /attribution content must match content_id/,
);

assert.throws(
  () => evaluateSocialAttributionReadback({
    observed_at: 'not-a-date',
    distribution_envelope: distributionEnvelope,
  }),
  /observed_at must be a valid ISO timestamp/,
);

console.log('Social attribution readback verified: HubSpot social-source observations stay source-level, exact campaign/content attribution requires matching contact-bound UTM evidence, exact pipeline claims additionally require an associated deal, duplicate rows do not inflate counts, and analytics remain observation-only.');
