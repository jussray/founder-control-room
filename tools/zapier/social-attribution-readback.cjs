'use strict';

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOCIAL_SOURCE_VALUES = new Set(['SOCIAL_MEDIA', 'PAID_SOCIAL']);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNonNegativeInteger(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseObservedAt(value) {
  const text = asTrimmedString(value);
  const millis = Date.parse(text);
  if (!text || !Number.isFinite(millis)) {
    const error = new Error('SOCIAL_ATTRIBUTION_READBACK_REJECTED: observed_at must be a valid ISO timestamp');
    error.code = 'SOCIAL_ATTRIBUTION_READBACK_REJECTED';
    throw error;
  }
  return new Date(millis).toISOString();
}

function validateDistributionEnvelope(envelope = {}) {
  const errors = [];
  const contentId = asTrimmedString(envelope.content_id);
  const platform = asTrimmedString(envelope.platform).toLowerCase();
  const sourceCommitSha = asTrimmedString(envelope.source?.commit_sha).toLowerCase();
  const attribution = envelope.attribution && typeof envelope.attribution === 'object'
    ? envelope.attribution
    : {};
  const utmSource = asTrimmedString(attribution.utm_source).toLowerCase();
  const utmMedium = asTrimmedString(attribution.utm_medium).toLowerCase();
  const utmCampaign = asTrimmedString(attribution.utm_campaign).toLowerCase();
  const utmContent = asTrimmedString(attribution.utm_content);

  if (!UUID.test(contentId)) errors.push('distribution_envelope.content_id must be a UUID');
  if (!platform) errors.push('distribution_envelope.platform is required');
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) {
    errors.push('distribution_envelope.source.commit_sha must be an exact commit SHA');
  }
  if (!utmSource || utmSource !== platform) {
    errors.push('distribution_envelope attribution source must match platform');
  }
  if (utmMedium !== 'social') {
    errors.push('distribution_envelope attribution medium must be social');
  }
  if (!utmCampaign) errors.push('distribution_envelope attribution campaign is required');
  if (utmContent !== contentId) {
    errors.push('distribution_envelope attribution content must match content_id');
  }

  if (errors.length > 0) {
    const error = new Error(`SOCIAL_ATTRIBUTION_READBACK_REJECTED: ${errors.join('; ')}`);
    error.code = 'SOCIAL_ATTRIBUTION_READBACK_REJECTED';
    error.details = errors;
    throw error;
  }

  return {
    contentId,
    platform,
    sourceCommitSha,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
  };
}

function normalizeContact(contact = {}) {
  const id = asTrimmedString(contact.id ?? contact.objectId ?? contact.hs_object_id);
  const properties = contact.properties && typeof contact.properties === 'object'
    ? contact.properties
    : contact;
  const originalSource = asTrimmedString(properties.hs_analytics_source).toUpperCase();
  const latestSource = asTrimmedString(properties.hs_latest_source).toUpperCase();
  const socialOriginal = SOCIAL_SOURCE_VALUES.has(originalSource);
  const socialLatest = SOCIAL_SOURCE_VALUES.has(latestSource);

  return {
    id,
    socialOriginal,
    socialLatest,
    socialObserved: socialOriginal || socialLatest,
    originalSource: originalSource || null,
    latestSource: latestSource || null,
    associatedDealCount: asNonNegativeInteger(properties.num_associated_deals),
  };
}

function evaluateEvidence(evidence = {}, expected) {
  const contactId = asTrimmedString(evidence.contact_id ?? evidence.contactId);
  const utmSource = asTrimmedString(evidence.utm_source).toLowerCase();
  const utmMedium = asTrimmedString(evidence.utm_medium).toLowerCase();
  const utmCampaign = asTrimmedString(evidence.utm_campaign).toLowerCase();
  const utmContent = asTrimmedString(evidence.utm_content);
  const evidenceRef = asTrimmedString(evidence.evidence_ref ?? evidence.evidenceRef);
  const failures = [];

  if (!contactId) failures.push('missing_contact_id');
  if (utmSource !== expected.utmSource) failures.push('source_mismatch');
  if (utmMedium !== expected.utmMedium) failures.push('medium_mismatch');
  if (utmCampaign !== expected.utmCampaign) failures.push('campaign_mismatch');
  if (utmContent !== expected.utmContent) failures.push('content_mismatch');
  if (!evidenceRef) failures.push('missing_evidence_ref');

  return {
    contactId,
    exactMatch: failures.length === 0,
    failures,
    evidenceRef: evidenceRef || null,
  };
}

function evaluateSocialAttributionReadback(input = {}) {
  const observedAt = parseObservedAt(input.observed_at);
  const expected = validateDistributionEnvelope(input.distribution_envelope);
  const contacts = Array.isArray(input.contacts) ? input.contacts : [];
  const attributionEvidence = Array.isArray(input.attribution_evidence)
    ? input.attribution_evidence
    : [];

  const contactMap = new Map();
  let duplicateContactCount = 0;
  for (const rawContact of contacts) {
    const contact = normalizeContact(rawContact);
    if (!contact.id) continue;
    if (contactMap.has(contact.id)) duplicateContactCount += 1;
    contactMap.set(contact.id, contact);
  }

  const exactEvidenceByContact = new Map();
  const rejectedEvidence = [];
  for (const rawEvidence of attributionEvidence) {
    const evidence = evaluateEvidence(rawEvidence, expected);
    if (!evidence.exactMatch) {
      rejectedEvidence.push({ contact_id: evidence.contactId || null, failures: evidence.failures });
      continue;
    }
    exactEvidenceByContact.set(evidence.contactId, evidence);
  }

  let socialSourceObservedContacts = 0;
  let socialSourceObservedContactsWithDeals = 0;
  let exactAttributedContacts = 0;
  let exactAttributedContactsWithDeals = 0;

  for (const contact of contactMap.values()) {
    if (!contact.socialObserved) continue;
    socialSourceObservedContacts += 1;
    if (contact.associatedDealCount > 0) socialSourceObservedContactsWithDeals += 1;

    if (exactEvidenceByContact.has(contact.id)) {
      exactAttributedContacts += 1;
      if (contact.associatedDealCount > 0) exactAttributedContactsWithDeals += 1;
    }
  }

  const baseline = input.baseline && typeof input.baseline === 'object' ? input.baseline : {};
  const baselineSocial = asNonNegativeInteger(baseline.social_source_observed_contacts);
  const baselineExact = asNonNegativeInteger(baseline.exact_attributed_contacts);

  let state = 'baseline-zero';
  if (socialSourceObservedContacts > 0) state = 'social-source-observed';
  if (exactAttributedContacts > 0) state = 'exact-attribution-observed';
  if (exactAttributedContactsWithDeals > 0) state = 'exact-attributed-pipeline-observed';

  return {
    version: 1,
    state,
    observed_at: observedAt,
    source: {
      provider: 'hubspot',
      mode: 'read_only_snapshot',
      external_write_included: false,
    },
    distribution: {
      content_id: expected.contentId,
      platform: expected.platform,
      source_commit_sha: expected.sourceCommitSha,
      utm_source: expected.utmSource,
      utm_medium: expected.utmMedium,
      utm_campaign: expected.utmCampaign,
      utm_content: expected.utmContent,
    },
    metrics: {
      social_source_observed_contacts: socialSourceObservedContacts,
      social_source_observed_contacts_with_deals: socialSourceObservedContactsWithDeals,
      exact_attributed_contacts: exactAttributedContacts,
      exact_attributed_contacts_with_deals: exactAttributedContactsWithDeals,
      social_source_delta_from_baseline: socialSourceObservedContacts - baselineSocial,
      exact_attributed_delta_from_baseline: exactAttributedContacts - baselineExact,
      duplicate_contact_rows: duplicateContactCount,
      rejected_attribution_evidence: rejectedEvidence.length,
    },
    claims: {
      social_source_observed: socialSourceObservedContacts > 0,
      exact_campaign_content_attribution_observed: exactAttributedContacts > 0,
      exact_attributed_pipeline_observed: exactAttributedContactsWithDeals > 0,
      social_source_fields_alone_prove_exact_post_attribution: false,
    },
    evidence_boundaries: {
      social_source_fields_prove: 'social-source observation only',
      exact_campaign_content_claim_requires: 'matching contact-bound UTM evidence for source, medium, campaign, and content',
      pipeline_claim_requires: 'exact attribution evidence plus an associated HubSpot deal',
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
    },
    rejected_evidence: rejectedEvidence,
  };
}

module.exports = {
  evaluateSocialAttributionReadback,
  SOCIAL_SOURCE_VALUES,
};
