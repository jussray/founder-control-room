import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  FIRST_PARTY_SOCIAL_PLATFORMS,
  type FirstPartySocialPlatform,
} from './firstPartySocialPublisher.js';

export const CONTENT_LANE_SYSTEM_CONTRACT = 'fcr/content-lane-system@v1' as const;

export const CONTENT_LANE_SHARED_SYSTEM = Object.freeze({
  sequence: Object.freeze([
    'audience-problem-promise',
    'repeatable-format',
    'content-engine',
    'return-loop',
    'money-path',
    'measure-compound-or-kill',
  ] as const),
  pillars: Object.freeze(['DISCOVER', 'PROVE', 'BELONG', 'CONVERT'] as const),
  contentUnit: Object.freeze(['HOOK', 'VALUE', 'PROOF', 'PAYOFF', 'CTA'] as const),
  faceless: Object.freeze({
    allowed: true,
    originalValueRequired: true,
    copiedOrReusedContentIsStrategy: false,
    aiSlideshowSpamRejected: true,
    faceNotRequiredButPointOfViewIsRequired: true,
  }),
  returnLoop: Object.freeze({
    recurringSeriesPreferredOverRandomPosts: true,
    questionsPollsAndCommentsAreLearningSignals: true,
    returningAudienceEvidenceShouldBeMeasured: true,
    communitySignalsAreEvidenceNotAuthority: true,
  }),
  monetization: Object.freeze({
    directMoneyPathDesignedEarly: true,
    platformAdsAreBonus: true,
    platformEligibilityRequiresProviderEvidence: true,
    visibilityIsNotRevenue: true,
    revenueRequiresOutcomeEvidence: true,
  }),
  learning: Object.freeze({
    promoteOnlyOnLaneNorthStarOutcomeEvidence: true,
    repeatabilityRequiresDistinctRunReceipts: true,
    missesRemainRevisionMemory: true,
    oneSpikeDoesNotProveRepeatability: true,
    outcomeUnknownIsNotFailureOrSuccess: true,
  }),
});

export interface ContentLaneNorthStar {
  id: string;
  outcome: string;
  evidenceSignals: readonly string[];
}

export interface ContentLaneDefinition {
  contract: typeof CONTENT_LANE_SYSTEM_CONTRACT;
  laneId: string;
  platform: FirstPartySocialPlatform;
  northStar: ContentLaneNorthStar;
  nativeFormats: readonly string[];
  discoveryMechanics: readonly string[];
  returnMechanics: readonly string[];
  conversionPaths: readonly string[];
  proofPreference: readonly string[];
  publication: {
    contentField: string;
    adapterReadiness: string;
    requiresMedia: boolean;
    accountBoundary: string;
  };
  authority: {
    advisoryOnly: true;
    authorizesPublish: false;
    authorizesSchedule: false;
    authorizesSpend: false;
    authorizesScaleExecution: false;
  };
}

type LaneInput = Omit<ContentLaneDefinition, 'contract' | 'platform' | 'publication' | 'authority'>;

function defineLane(platform: FirstPartySocialPlatform, input: LaneInput): ContentLaneDefinition {
  const capability = FIRST_PARTY_PLATFORM_CAPABILITIES[platform];
  return Object.freeze({
    contract: CONTENT_LANE_SYSTEM_CONTRACT,
    ...input,
    platform,
    publication: Object.freeze({
      contentField: capability.contentField,
      adapterReadiness: capability.adapterReadiness,
      requiresMedia: capability.requiresMedia,
      accountBoundary: capability.accountBoundary,
    }),
    authority: Object.freeze({
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      authorizesScaleExecution: false,
    }),
  });
}

export const CONTENT_LANES: Record<FirstPartySocialPlatform, ContentLaneDefinition> = Object.freeze({
  linkedin: defineLane('linkedin', {
    laneId: 'content-linkedin',
    northStar: {
      id: 'qualified-founder-opportunities',
      outcome: 'Proof-led founder content creates attributable qualified conversations, leads, partnerships, or buyer opportunities.',
      evidenceSignals: ['qualified replies', 'profile or proof-link actions', 'inbound opportunity conversations', 'attributable leads', 'verified revenue'],
    },
    nativeFormats: ['proof-led text post', 'native video', 'document or carousel', 'comment-thread follow-up'],
    discoveryMechanics: ['founder thesis', 'build lesson', 'contrarian but evidenced insight', 'searchable problem framing'],
    returnMechanics: ['named founder series', 'follow-up proof posts', 'comment continuations', 'milestone updates'],
    conversionPaths: ['service or implementation conversation', 'product demo or signup', 'partnership or sponsor conversation', 'owned resource or email relationship'],
    proofPreference: ['product demo', 'GitHub or runtime receipt', 'before-after result', 'customer or workflow outcome'],
  }),
  facebook: defineLane('facebook', {
    laneId: 'content-facebook',
    northStar: {
      id: 'returning-community-to-action',
      outcome: 'Community-oriented content creates returning participation that produces attributable next actions, leads, support, or sales.',
      evidenceSignals: ['returning commenters or viewers', 'meaningful discussion', 'link or profile actions', 'qualified messages', 'verified revenue'],
    },
    nativeFormats: ['Reel', 'community story post', 'discussion post', 'photo or proof post'],
    discoveryMechanics: ['relatable problem story', 'useful demonstration', 'community-relevant proof', 'share-worthy lesson'],
    returnMechanics: ['recurring community series', 'questions and polls', 'comment follow-ups', 'milestone or family/community updates'],
    conversionPaths: ['product or service', 'community membership or support path', 'owned resource', 'qualified message conversation'],
    proofPreference: ['real product behavior', 'human outcome', 'community result', 'public proof surface'],
  }),
  instagram: defineLane('instagram', {
    laneId: 'content-instagram',
    northStar: {
      id: 'saved-shared-proof-to-qualified-action',
      outcome: 'Visually strong proof earns saves, shares, return behavior, and attributable qualified actions beyond passive reach.',
      evidenceSignals: ['saves', 'shares', 'returning viewers', 'profile or link actions', 'attributable leads or revenue'],
    },
    nativeFormats: ['Reel', 'carousel', 'Story', '4:5 hero proof still'],
    discoveryMechanics: ['first-second visual hook', 'transformation', 'visual problem-solution', 'searchable caption and topic framing'],
    returnMechanics: ['recognizable Reel series', 'Story follow-ups', 'carousel continuations', 'viewer-requested next parts'],
    conversionPaths: ['product or app action', 'service inquiry', 'owned resource', 'affiliate or sponsor path when relevant and disclosed'],
    proofPreference: ['screen or product footage', 'before-after visual', 'founder build footage', 'receipt embedded inside story'],
  }),
  threads: defineLane('threads', {
    laneId: 'content-threads',
    northStar: {
      id: 'returning-conversation-to-qualified-action',
      outcome: 'Useful conversational posts create repeat participation and attributable movement toward a relationship, product, or offer.',
      evidenceSignals: ['quality replies', 'repeat participants', 'profile or link actions', 'qualified conversations', 'verified conversions'],
    },
    nativeFormats: ['conversation post', 'multi-post thread', 'reply-chain follow-up', 'text plus proof media'],
    discoveryMechanics: ['sharp question', 'founder observation', 'useful micro-lesson', 'timely conversation with original value'],
    returnMechanics: ['named conversation series', 'reply-led follow-ups', 'open questions', 'progress updates'],
    conversionPaths: ['owned resource', 'product or service next action', 'qualified DM or public conversation', 'community relationship'],
    proofPreference: ['linked proof', 'concise screenshot or media proof', 'specific experiment result', 'public build receipt'],
  }),
  x: defineLane('x', {
    laneId: 'content-x',
    northStar: {
      id: 'qualified-conversation-and-clickthrough',
      outcome: 'Concise proof-led posts generate qualified conversation and attributable clicks or actions rather than empty impressions.',
      evidenceSignals: ['quality replies', 'reposts with context', 'proof-link clicks', 'profile actions', 'verified leads or revenue'],
    },
    nativeFormats: ['concise post', 'thread', 'reply or quote-post', 'short proof clip'],
    discoveryMechanics: ['tight claim', 'live build insight', 'useful disagreement', 'proof-first observation'],
    returnMechanics: ['recurring build log', 'follow-up thread', 'reply conversations', 'experiment updates'],
    conversionPaths: ['proof link', 'product or service action', 'owned resource', 'qualified conversation'],
    proofPreference: ['exact source link', 'product clip', 'metric or runtime receipt', 'before-after result'],
  }),
  tiktok: defineLane('tiktok', {
    laneId: 'content-tiktok',
    northStar: {
      id: 'retained-viewer-to-qualified-action',
      outcome: 'Short-form storytelling retains the right viewer long enough to create return behavior and a measurable next action.',
      evidenceSignals: ['completion or retention', 'rewatches', 'returning viewers', 'profile or link actions', 'attributable leads or revenue'],
    },
    nativeFormats: ['vertical short', 'tutorial', 'storytime', 'product or build demonstration'],
    discoveryMechanics: ['first-second motion hook', 'painful problem', 'curiosity gap with real payoff', 'searchable spoken and captioned topic'],
    returnMechanics: ['part-based series', 'viewer-requested response video', 'recurring character or build format', 'comment-led continuation'],
    conversionPaths: ['profile next action', 'product or app action', 'owned resource', 'relevant affiliate or sponsor path with disclosure'],
    proofPreference: ['real product footage', 'screen proof', 'before-after demonstration', 'observable result'],
  }),
  youtube: defineLane('youtube', {
    laneId: 'content-youtube',
    northStar: {
      id: 'returning-viewer-watchtime-to-qualified-action',
      outcome: 'Useful videos create returning viewers and meaningful watch time that compounds into attributable qualified actions and revenue.',
      evidenceSignals: ['returning viewers', 'watch time', 'retention', 'subscriber conversion', 'qualified leads', 'verified revenue'],
    },
    nativeFormats: ['Short', 'long-form video', 'proof walkthrough', 'community follow-up'],
    discoveryMechanics: ['search or viewer intent', 'title-thumbnail promise', 'Short discovery', 'problem-led opening'],
    returnMechanics: ['recurring series', 'Short-to-long-form continuation', 'follow-up questions', 'milestones and viewer-requested episodes'],
    conversionPaths: ['product or service', 'owned resource', 'membership or community where recurring value exists', 'affiliate or sponsor path when relevant and disclosed'],
    proofPreference: ['live product walkthrough', 'screen or runtime proof', 'before-after outcome', 'source-linked evidence'],
  }),
  pinterest: defineLane('pinterest', {
    laneId: 'content-pinterest',
    northStar: {
      id: 'evergreen-outbound-action',
      outcome: 'Evergreen visual content keeps earning qualified outbound actions and conversions after the first publication window.',
      evidenceSignals: ['saves', 'outbound clicks', 'repeat distribution over time', 'qualified landing actions', 'verified revenue'],
    },
    nativeFormats: ['Pin', 'video Pin', 'step-by-step visual', 'proof or transformation graphic'],
    discoveryMechanics: ['search intent', 'evergreen problem framing', 'visual transformation', 'useful reference asset'],
    returnMechanics: ['related Pin series', 'board-level thematic continuity', 'updated evergreen variants', 'seasonal refresh with same truth boundary'],
    conversionPaths: ['owned landing page', 'product or service', 'digital resource', 'relevant affiliate path with disclosure'],
    proofPreference: ['before-after visual', 'step evidence', 'product result', 'source-linked claim'],
  }),
  bluesky: defineLane('bluesky', {
    laneId: 'content-bluesky',
    northStar: {
      id: 'qualified-public-conversation-and-clickthrough',
      outcome: 'Original public conversation earns repeat engagement and attributable movement to proof, product, or relationship surfaces.',
      evidenceSignals: ['quality replies', 'reposts', 'repeat participants', 'proof-link actions', 'qualified conversions'],
    },
    nativeFormats: ['short post', 'thread', 'reply-chain', 'media proof post'],
    discoveryMechanics: ['useful observation', 'open technical or founder question', 'proof-linked claim', 'timely conversation'],
    returnMechanics: ['recurring founder/build series', 'thread continuations', 'reply follow-ups', 'experiment updates'],
    conversionPaths: ['proof or product link', 'owned resource', 'qualified conversation', 'community relationship'],
    proofPreference: ['public source', 'product screenshot or clip', 'experiment outcome', 'runtime or repository evidence'],
  }),
  mastodon: defineLane('mastodon', {
    laneId: 'content-mastodon',
    northStar: {
      id: 'qualified-community-conversation-and-clickthrough',
      outcome: 'Community-respecting posts generate substantive discussion and attributable movement to proof, product, or owned resources.',
      evidenceSignals: ['replies', 'boosts with context', 'repeat participants', 'link actions', 'qualified conversions'],
    },
    nativeFormats: ['post', 'thread', 'media post', 'reply-led follow-up'],
    discoveryMechanics: ['useful technical or founder lesson', 'community-relevant proof', 'clear problem framing', 'original commentary'],
    returnMechanics: ['series continuity', 'reply follow-ups', 'build updates', 'community questions'],
    conversionPaths: ['proof or product link', 'owned resource', 'qualified conversation', 'service or product next action'],
    proofPreference: ['source link', 'product or screen proof', 'specific experiment result', 'public receipt'],
  }),
  google_business: defineLane('google_business', {
    laneId: 'content-google-business',
    northStar: {
      id: 'qualified-local-action',
      outcome: 'Verified local-business content creates attributable high-intent actions such as website visits, calls, directions, bookings, or purchases.',
      evidenceSignals: ['website actions', 'calls', 'direction or location actions', 'booking or inquiry actions', 'verified revenue'],
    },
    nativeFormats: ['business update', 'offer or launch update when supported', 'event or milestone update when supported', 'proof photo or media update'],
    discoveryMechanics: ['local intent', 'current offer or capability', 'trust proof', 'timely business update'],
    returnMechanics: ['current updates', 'milestones', 'fresh proof', 'repeat local value'],
    conversionPaths: ['website', 'call or inquiry', 'booking', 'purchase or visit'],
    proofPreference: ['verified business identity', 'current product or service proof', 'customer-safe outcome evidence', 'current availability or offer evidence'],
  }),
});

export function getContentLane(platform: FirstPartySocialPlatform): ContentLaneDefinition {
  return CONTENT_LANES[platform];
}

export function listContentLanes(): readonly ContentLaneDefinition[] {
  return FIRST_PARTY_SOCIAL_PLATFORMS.map((platform) => CONTENT_LANES[platform]);
}

export function contentLaneSystemSnapshot() {
  return Object.freeze({
    contract: CONTENT_LANE_SYSTEM_CONTRACT,
    shared: CONTENT_LANE_SHARED_SYSTEM,
    lanes: listContentLanes(),
    authority: Object.freeze({
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      authorizesScaleExecution: false,
    }),
  });
}
