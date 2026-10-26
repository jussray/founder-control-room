import { createHash } from 'node:crypto';
import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  FIRST_PARTY_SOCIAL_PLATFORMS,
  type FirstPartySocialPlatform,
} from './firstPartySocialPublisher.js';
import { getContentLane } from './contentLaneSystem.js';

/**
 * Review-only Founder Signal Engine package. No providers, storage, model calls,
 * accounts or publication authority. User-supplied observations are NOT proof.
 */
export const FOUNDER_SIGNAL_CAMPAIGN_CONTRACT = 'fcr/founder-signal-campaign@v1' as const;
export const FOUNDER_SIGNAL_CAMPAIGN_TOOL = 'plan_founder_signal_campaign' as const;
const SHA = /^[a-f0-9]{40}$/i;
const REPO = /^jussray\/[A-Za-z0-9_.-]+$/;
const TAG = /^[A-Za-z][A-Za-z0-9]{2,23}$/;
const SECRET = /(sk-[a-z0-9_-]{12,}|Bearer\s+\S+|api[_ -]?key|password|service[_ -]?role|private[_ -]?key|hooks\.zapier\.com)/i;
const PERSONAL = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4})/i;
const PLATFORMS = new Set<string>(FIRST_PARTY_SOCIAL_PLATFORMS);
const INTENTS = new Set(['proof-update', 'conversation-research', 'personal-founder', 'offer']);
const MEDIA = new Set(['auto', 'image', 'video', 'carousel', 'none']);
type RecordValue = Record<string, unknown>;
const record = (x: unknown): RecordValue => x && typeof x === 'object' && !Array.isArray(x) ? x as RecordValue : {};
const string = (x: unknown): string => typeof x === 'string' ? x.trim() : '';
const digest = (x: unknown): string => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const normalize = (x: string): string => x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
function publicProof(x: string, repo: string) {
  try {
    const url = new URL(x);
    return url.protocol === 'https:' && url.hostname === 'github.com' &&
      url.pathname.startsWith('/' + repo + '/') &&
      /\/(commit|pull|issues|actions|blob)\/[A-Za-z0-9._/-]+/.test(url.pathname) &&
      url.username === '' && url.password === '' && url.search === '' && url.hash === '';
  } catch { return false; }
}
function safeText(value: unknown, label: string, max = 550): string {
  const out = string(value);
  if (!out || out.length > max || SECRET.test(out) || PERSONAL.test(out)) {
    throw new Error(label + ': required, bounded, and free of credential or contact data');
  }
  if (/https?:\/\/(?:127\.|localhost|10\.|192\.168\.|169\.254\.)/i.test(out)) {
    throw new Error(label + ': internal addresses prohibited');
  }
  return out;
}
function short(x: string, max: number): string {
  return x.length > max ? x.slice(0, max - 1).trimEnd() + '…' : x;
}
function tagsFor(platform: string, topics: readonly string[]) {
  const amount = platform === 'linkedin' ? 5 : platform === 'instagram' || platform === 'tiktok' ? 5 : platform === 'x' ? 2 : 3;
  return topics.slice(0, amount).map(x => '#' + x);
}
function mediaKind(platform: string, requested: string): string {
  if (requested === 'none') return 'text-only';
  if (requested === 'image') return 'image';
  if (requested === 'carousel') return 'carousel';
  if (requested === 'video') return 'video';
  return ['instagram', 'tiktok', 'youtube'].includes(platform) ? 'video' : 'image';
}
function mediaPackage(platform: string, requested: string, humanObservation: string, verifiedFact: string, truthBoundary: string) {
  const kind = mediaKind(platform, requested);
  if (kind === 'text-only') return {
    kind, state: 'NOT_APPLICABLE', originalAssetProvided: false,
    requirement: 'No media; confirm platform capability before handoff.',
  };
  const ratio = kind === 'video' ? '9:16' : platform === 'pinterest' ? '2:3' : '4:5';
  return {
    kind, ratio, state: 'NOT_RENDERED', assetId: null, assetSha256: null,
    originalAssetProvided: false,
    visualContract: 'juss/visual-wonder-brief',
    rendererVerdictRequired: 'juss/visual-wonder-artifact-verdict',
    visualHook: short('Show the human consequence of: ' + humanObservation, 180),
    scene: short('A real product or public-safe proof object illustrates: ' + verifiedFact, 230),
    truthBoundary,
    altTextDirection: short('Describe what is actually visible, with no invented UI or results: ' + verifiedFact, 180),
    production: kind === 'video'
      ? ['0–1s: visual hook', '1–4s: real problem', '4–8s: demonstrable proof', '8–12s: human payoff and single next step', 'captions + safe-zones + reduced motion']
      : ['1 clear visual claim', 'readable and accessible copy', 'public-safe proof object', 'licensed or original image only', 'safe-zones + alt text'],
    releaseGate: 'Real rendered media, usage rights, brand/canon and proof checks, founder review required.',
  };
}
function platformCopy(platform: string, x: { observation: string; fact: string; value: string; boundary: string; cta: string; proof: string; hashtags: readonly string[]; intent: string }) {
  const proof = x.intent === 'proof-update' ? '\n' + x.proof : '';
  const tags = x.hashtags.join(' ');
  let copy: string;
  if (platform === 'linkedin') {
    copy = [
      x.observation,
      'What I am building: ' + x.fact,
      'Why it matters: ' + x.value,
      'What still needs proving: ' + x.boundary,
      x.cta + proof,
      tags,
    ].join('\n\n');
  } else if (['instagram', 'facebook', 'threads'].includes(platform)) {
    copy = [
      x.observation,
      x.fact,
      x.value,
      'Still to verify: ' + x.boundary,
      x.cta + proof,
      tags,
    ].join('\n\n');
  } else if (platform === 'x' || platform === 'bluesky' || platform === 'mastodon') {
    copy = [short(x.observation + ' ' + x.fact, platform === 'x' ? 92 : 240), short(x.value, platform === 'x' ? 40 : 200),
      x.cta + proof, tags].join('\n');
  } else if (['youtube', 'tiktok'].includes(platform)) {
    copy = ['Hook: ' + x.observation, 'Show: ' + x.fact, 'Payoff: ' + x.value,
      'Truth boundary: ' + x.boundary, x.cta + proof, tags].join('\n');
  } else {
    copy = [x.observation, x.fact, x.value, x.cta + proof, tags].join('\n\n');
  }
  return copy;
}

export function planFounderSignalCampaign(raw: unknown) {
  const input = record(raw);
  const source = record(input.source);
  const strategy = record(input.strategy);
  const repo = safeText(source.repository, 'source.repository', 100);
  const sha = string(source.commitSha);
  const url = string(source.proofUrl);
  if (!REPO.test(repo) || !SHA.test(sha)) throw new Error('Exact owned source repository and 40-character commit required');
  if (!publicProof(url, repo)) throw new Error('Public-safe GitHub proof URL must match source repository');
  if (source.visibility !== 'public') throw new Error('Only explicitly public source evidence can become a proposed social draft');
  const intent = safeText(strategy.intent, 'strategy.intent', 30);
  if (!INTENTS.has(intent)) throw new Error('Unsupported content intent');
  const audience = safeText(strategy.audience, 'strategy.audience', 180);
  const observation = safeText(strategy.observation, 'strategy.observation', 220);
  const fact = safeText(strategy.fact, 'strategy.fact', 260);
  const value = safeText(strategy.audienceValue, 'strategy.audienceValue', 220);
  const boundary = safeText(strategy.truthBoundary, 'strategy.truthBoundary', 240);
  const cta = safeText(strategy.callToAction, 'strategy.callToAction', 140);
  const thesis = safeText(strategy.thesis, 'strategy.thesis', 150);
  const topics = input.topics;
  if (!Array.isArray(topics) || topics.length < 3 || topics.length > 10 ||
    topics.some(x => typeof x !== 'string' || !TAG.test(x))) {
    throw new Error('Provide three to ten short, relevant hashtag topics without a # prefix');
  }
  const normalizedTopics = [...new Set(topics.map((x: string) => x.toLowerCase()))];
  if (normalizedTopics.length < 3) throw new Error('At least three distinct topics required');
  const platforms = input.platforms;
  if (!Array.isArray(platforms) || platforms.length < 1 || platforms.length > 11 ||
    platforms.some(x => typeof x !== 'string' || !PLATFORMS.has(x)) ||
    new Set(platforms).size !== platforms.length) {
    throw new Error('Select distinct supported platform identifiers');
  }
  const mediaChoice = input.mediaPreference === undefined ? 'auto' : string(input.mediaPreference);
  if (!MEDIA.has(mediaChoice)) throw new Error('Invalid media preference');
  if (mediaChoice === 'none' && platforms.some(x => FIRST_PARTY_PLATFORM_CAPABILITIES[x as FirstPartySocialPlatform].requiresMedia)) {
    throw new Error('Selected platform requires media; text-only cannot pass');
  }
  const prior = input.recentPosts === undefined ? [] : input.recentPosts;
  if (!Array.isArray(prior) || prior.length > 15) throw new Error('recentPosts must contain up to 15 provenance-bound records');
  const past = prior.map((item: unknown) => {
    const post = record(item);
    const priorThesis = safeText(post.thesis, 'recentPosts.thesis', 150);
    const priorUrl = string(post.publicPostUrl);
    if (!/^https:\/\/[^\s?#]+$/.test(priorUrl) || SECRET.test(priorUrl)) {
      throw new Error('Each prior post must have a public post URL; unverified stylistic memory is not proof');
    }
    return { thesis: normalize(priorThesis), postUrl: priorUrl };
  });
  const stale = past.some(p => p.thesis === normalize(thesis));
  const fields = { observation, fact, value, boundary, cta, proof: url, intent };
  const variants = platforms.map((id: FirstPartySocialPlatform) => {
    const lane = getContentLane(id);
    const hashtags = tagsFor(id, normalizedTopics);
    const copy = platformCopy(id, { ...fields, hashtags });
    const limit = FIRST_PARTY_PLATFORM_CAPABILITIES[id].safeCharacterLimit;
    const textFits = limit === null ? null : copy.length <= limit;
    const creative = mediaPackage(id, mediaChoice, observation, fact, boundary);
    return {
      platform: id, contentField: lane.publication.contentField,
      northStar: lane.northStar.id,
      copy, hashtags, charCount: copy.length, safeCharacterLimit: limit,
      textFitsVerifiedPlatformLimit: textFits,
      media: creative,
      status: stale ? 'HOLD_FRESHNESS' : textFits === false ? 'HOLD_COPY_LIMIT' : 'FOUNDER_REVIEW_ONLY',
      requires: ['Verify exact public source and current claim', 'Confirm intended account and current native limits',
        'Review founder voice, subject and visual assets', 'Apply existing content/output and visual-wonder gates',
        'Obtain per-copy current founder approval before any scheduling/publication'],
    };
  });
  const kit = {
    contract: FOUNDER_SIGNAL_CAMPAIGN_CONTRACT,
    evidenceClass: 'USER_SUPPLIED_UNVERIFIED',
    operationalState: stale ? 'HOLD_REPETITIVE_ANGLE' : 'FOUNDER_REVIEW_ONLY',
    authority: {
      canPublish: false, canSchedule: false, canCreateBufferDraft: false,
      canMutateHubSpot: false, canCallModel: false, canUploadMedia: false,
      founderReviewRequired: true,
    },
    source: { repository: repo, commitSha: sha.toLowerCase(), proofUrl: url },
    intent, audience, thesis,
    authoringGuidance: {
      provenance: 'Documented founder editorial blueprint; NOT a verified analysis of live historical posts',
      voice: ['direct', 'human', 'founder-led', 'specific', 'technically clear', 'no inflated claims'],
      antiRepetition: stale ? 'Exact recent thesis repeated: create a meaningfully new angle' : 'No exact recent thesis collision in provided provenance records',
      oneStructuredAiAction: true,
      noExtraSeparateFutureYouOrPlatformAiJobs: true,
    },
    decisionLenses: {
      ME: 'Current reality: user-supplied draft and source metadata, not independent publication or outcome evidence',
      FutureYou: 'Editorial guidance only; do not describe imagined future as historical fact',
      ChiefAI: stale ? 'Hold, replace repetitive thesis' : 'Prepare platform drafts and media assets for explicit founder review',
      fiveWOneH: {
        who: audience, what: fact, where: platforms.join(', '),
        when: 'After public source and current claims are independently checked',
        why: value, how: cta,
      },
    },
    variants,
    analyticsPlan: ['24h platform-native reach and engaged conversations', '48h comparable platform-native performance',
      'attributed relevant inquiries where verified', 'feedback and correction log', 'never infer users, customers or partners from views'],
    continuation: {
      nextGate: stale ? 'Choose a genuinely fresh thesis' : 'Verify public proof and review actual rendered media, accounts and finished copy',
      workflow: ['GitHub source', 'one AI analysis', 'platform-native creative direction',
        'original or licensed media production', 'visual/reputation safeguards',
        'founder approval', 'draft-only Buffer or first-party lifecycle',
        'native provider readback', 'HubSpot/FCR receipt', 'outcome measurement'],
      continuityFingerprint: digest({ repo, sha, thesis, intent, platforms, recent: past.map(p => p.postUrl) }),
      notACookieOrTrackingIdentifier: true,
    },
  };
  return kit;
}
