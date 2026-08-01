import { createFakeTransport } from './fake-transport.mjs';

const CONTENT_FIELD_BY_PLATFORM = Object.freeze({
  linkedin: 'linkedin_draft',
  facebook_founder: 'facebook_founder_draft',
  facebook_brand: 'facebook_brand_draft',
  instagram: 'instagram_draft',
  threads: 'threads_draft',
  x: 'x_draft',
  bluesky: 'bluesky_draft',
  email: 'email_draft',
});

const VALID_MODES = new Set(['draft', 'queue', 'publish']);

function unique(values) {
  return [...new Set(values)];
}

function isProofUrl(value) {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim());
}

function requireSynthetic(input) {
  if (input.dataClassification !== 'synthetic') {
    throw new Error('AI Company Lab accepts synthetic data only.');
  }
}

function observeReality(input) {
  const blockers = [];

  if (!input.projectSlug?.trim()) blockers.push('missing project slug');
  if (!input.eventId?.trim()) blockers.push('missing stable event ID');
  if (!input.summary?.trim()) blockers.push('missing founder-readable summary');
  if (!VALID_MODES.has(input.requestedMode)) blockers.push('invalid requested mode');
  if (!Array.isArray(input.audiences) || input.audiences.length === 0) {
    blockers.push('missing target audience');
  }
  if (!Array.isArray(input.platforms) || input.platforms.length === 0) {
    blockers.push('missing destination platform');
  }
  if (input.proof?.projectSlug !== input.projectSlug) {
    blockers.push('proof and event belong to different projects');
  }
  if (!['ready', 'conditional', 'blocked'].includes(input.proof?.status)) {
    blockers.push('invalid proof status');
  }

  return {
    actor: 'reality-agent',
    projectSlug: input.projectSlug,
    eventId: input.eventId,
    blockers,
    observed: blockers.length === 0,
  };
}

function decideGovernance(input, reality) {
  const blockers = [...reality.blockers];
  const warnings = [];
  const proofUrls = unique((input.proof?.urls ?? []).filter(isProofUrl));
  const traction = (input.traction ?? []).filter(
    (signal) =>
      signal?.label?.trim() &&
      signal?.value?.trim() &&
      isProofUrl(signal?.sourceUrl),
  );
  const governanceAdvantages = (input.governanceAdvantages ?? []).filter(
    (advantage) => advantage?.label?.trim() && isProofUrl(advantage?.proofUrl),
  );

  if (input.proof?.status === 'blocked') blockers.push('proof engine is blocked');
  if (proofUrls.length === 0) blockers.push('missing clickable proof');
  if (traction.length === 0) {
    blockers.push('missing verified traction; activity is not traction');
  }
  if (governanceAdvantages.length === 0) {
    blockers.push('missing governance advantage with proof');
  }
  if (input.proof?.status === 'conditional') {
    warnings.push('proof is conditional; external queue or publish is disabled');
  }

  if (blockers.length > 0) {
    return {
      actor: 'governance-agent',
      status: 'blocked',
      recommendedMode: 'internal_only',
      publishAllowed: false,
      blockers,
      warnings,
      proofUrls,
      traction,
      governanceAdvantages,
    };
  }

  if (input.proof.status !== 'ready' || input.requestedMode === 'draft') {
    return {
      actor: 'governance-agent',
      status: 'draft_ready',
      recommendedMode: 'draft',
      publishAllowed: false,
      blockers,
      warnings,
      proofUrls,
      traction,
      governanceAdvantages,
    };
  }

  if (!input.founderApprovalId?.trim()) {
    return {
      actor: 'governance-agent',
      status: 'approval_required',
      recommendedMode: 'draft',
      publishAllowed: false,
      blockers,
      warnings,
      proofUrls,
      traction,
      governanceAdvantages,
    };
  }

  return {
    actor: 'governance-agent',
    status: 'authorized',
    recommendedMode: input.requestedMode,
    publishAllowed: true,
    blockers,
    warnings,
    proofUrls,
    traction,
    governanceAdvantages,
  };
}

function buildCanonicalStory(input, decision) {
  if (decision.status === 'blocked') return null;

  const tractionLine = decision.traction
    .map((signal) => `${signal.label}: ${signal.value}`)
    .join('; ');
  const governanceLine = decision.governanceAdvantages
    .map((advantage) => advantage.label)
    .join('; ');
  const proofLine = decision.proofUrls.join(' ');

  return {
    actor: 'story-agent',
    eventId: input.eventId,
    text: [
      input.summary.trim(),
      `Traction: ${tractionLine}`,
      `Governance: ${governanceLine}`,
      `Proof: ${proofLine}`,
    ].join('\n\n'),
  };
}

function adaptStory(platform, story) {
  const prefixByPlatform = {
    linkedin: '',
    facebook_founder: 'Founder note:\n\n',
    facebook_brand: 'Brand update:\n\n',
    instagram: 'Build update ✦\n\n',
    threads: 'What changed:\n\n',
    x: '',
    bluesky: '',
    email: 'Founder update\n\n',
  };

  return `${prefixByPlatform[platform] ?? ''}${story.text}`;
}

function buildCampaign(input, decision, story) {
  if (!story) return null;

  const platforms = unique(input.platforms);
  const drafts = platforms.map((platform) => ({
    platform,
    contentField: CONTENT_FIELD_BY_PLATFORM[platform] ?? 'unsupported_draft',
    content: adaptStory(platform, story),
  }));

  return {
    actor: 'campaign-agent',
    eventId: input.eventId,
    audiences: unique(input.audiences),
    drafts,
    destinationMode: decision.recommendedMode,
  };
}

function learnFromSimulation(input, decision, receipts) {
  return {
    actor: 'learning-agent',
    eventId: input.eventId,
    simulationOnly: true,
    observations: [
      `decision:${decision.status}`,
      `receipts:${receipts.length}`,
      `platforms:${unique(input.platforms).length}`,
    ],
    recommendation:
      decision.status === 'blocked'
        ? 'repair the first blocker before generating external drafts'
        : decision.status === 'approval_required'
          ? 'retain drafts and request an exact founder approval receipt'
          : 'evaluate synthetic outcomes before adding any live adapter',
  };
}

export function runCompanySimulation(
  input,
  {
    transport = createFakeTransport(),
    now = () => '2026-08-01T16:00:00.000Z',
  } = {},
) {
  requireSynthetic(input);

  const trace = [];
  const reality = observeReality(input);
  trace.push({ actor: reality.actor, status: reality.observed ? 'observed' : 'blocked' });

  const decision = decideGovernance(input, reality);
  trace.push({ actor: decision.actor, status: decision.status });

  const story = buildCanonicalStory(input, decision);
  if (story) trace.push({ actor: story.actor, status: 'complete' });

  const campaign = buildCampaign(input, decision, story);
  if (campaign) trace.push({ actor: campaign.actor, status: 'complete' });

  const receipts = [];
  if (campaign) {
    for (const draft of campaign.drafts) {
      receipts.push(
        transport.dispatch({
          platform: draft.platform,
          mode: decision.recommendedMode,
          content: draft.content,
          eventId: input.eventId,
          now: now(),
        }),
      );
    }
    trace.push({ actor: 'fake-transport-agent', status: 'simulated' });
  }

  const learning = learnFromSimulation(input, decision, receipts);
  trace.push({ actor: learning.actor, status: 'recorded' });

  return {
    lab: true,
    dataClassification: 'synthetic',
    liveSideEffects: false,
    decision,
    campaign,
    receipts,
    learning,
    trace,
  };
}
