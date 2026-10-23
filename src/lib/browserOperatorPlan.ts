/**
 * Founder-only browser test *preview*. No browser execution, provider calls,
 * credential reads, session imports, or approval issuance happen here.
 *
 * Keep route and manifest counts synchronized in test/fcr-browser-plan.test.mjs.
 */
export const FCR_BROWSER_PREVIEW_CONTRACT = 'fcr/browser-operator-preview@v1';

const PROJECT_DOMAIN = 'games.jussco.company';
const MANIFEST_PATH = 'config/browser-journeys/sync-party.json';
const MAX_LENGTH = 500;
const UNSAFE_PATTERN = [
  /\b(?:delete|wipe|erase|destroy|remove|reset|drop|truncate)\b/i,
  /\b(?:merge|deploy|publish|release|ship|rollback|revert|commit|push|pull request|pr\b|branch)\b/i,
  /\b(?:purchase|buy|pay|checkout|transfer|invoice|refund|order|subscribe)\b/i,
  /\b(?:email|message|dm\b|sms|post|share|send|upload|download|export|scrape|crawl)\b/i,
  /\b(?:login|log in|sign in|password|credential|secret|api key|access token|cookie|session storage|localstorage)\b/i,
  /\b(?:admin|dashboard|private|parent|minor|journal|voice note|health record|user data|database|supabase)\b/i,
  /\b(?:javascript|execute code|eval|shell|terminal|command|fetch|request headers|webhook|endpoint)\b/i,
  /\b(?:ignore instructions|override|bypass|disable safety|no approval|without approval)\b/i,
];
const SUPPORTED_PROJECT = [
  /\bgames\.jussco\.company\b/i,
  /\bsync[\s-]+party\b/i,
  /\bsync-party-game\b/i,
];

type RejectionReason =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_INTENT'
  | 'MIXED_OR_UNSAFE_INTENT'
  | 'UNTRUSTED_SYNTAX'
  | 'UNKNOWN_PROJECT'
  | 'CROSS_PROJECT_REQUEST';

interface RejectedPreview {
  contract: typeof FCR_BROWSER_PREVIEW_CONTRACT;
  status: 'REJECTED';
  reason: RejectionReason;
  browserExecuted: false;
}

interface ApprovedPlanPreview {
  contract: typeof FCR_BROWSER_PREVIEW_CONTRACT;
  status: 'REQUIRES_FOUNDER_RUN_APPROVAL';
  project: 'sync-party-game';
  targetOrigin: 'https://games.jussco.company';
  journey: 'sync-party';
  manifest: typeof MANIFEST_PATH;
  actorCount: 2;
  stepCount: 53;
  actionScope: 'synthetic-playwright-public-journey';
  browserExecuted: false;
  approvalIssued: false;
  mergeAuthorized: false;
  deployAuthorized: false;
  writeAuthorization: false;
  nextGate: 'Exact manifest fingerprint and separate founder run authorization in execution control plane';
}

export type BrowserPreviewResult = RejectedPreview | ApprovedPlanPreview;

function reject(reason: RejectionReason): RejectedPreview {
  return { contract: FCR_BROWSER_PREVIEW_CONTRACT, status: 'REJECTED', reason, browserExecuted: false };
}

/** Interpret only the known Sync Party *test* intent; never execute page text. */
export function previewFounderBrowserIntent(raw: unknown): BrowserPreviewResult {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH || raw.trim().length < 12) {
    return reject('INVALID_REQUEST');
  }
  const request = raw.trim();
  if (!/^(?:please\s+)?(?:test|verify|check|audit|run(?:\s+a)?\s+test)\b/i.test(request)) {
    return reject('UNSUPPORTED_INTENT');
  }
  if (UNSAFE_PATTERN.some((rule) => rule.test(request))) {
    return reject('MIXED_OR_UNSAFE_INTENT');
  }
  if (/[<>\\{}]|https?:\/\/[^\s"']+@/i.test(request)) {
    return reject('UNTRUSTED_SYNTAX');
  }
  if (!SUPPORTED_PROJECT.some((rule) => rule.test(request))) {
    return reject('UNKNOWN_PROJECT');
  }
  const hosts = [...request.matchAll(/\b(?:[a-z0-9-]+\.)+(?:company|org|net|com|app)\b/gi)]
    .map((match) => match[0].toLowerCase());
  if (hosts.some((host) => host !== PROJECT_DOMAIN)) {
    return reject('CROSS_PROJECT_REQUEST');
  }
  return {
    contract: FCR_BROWSER_PREVIEW_CONTRACT,
    status: 'REQUIRES_FOUNDER_RUN_APPROVAL',
    project: 'sync-party-game',
    targetOrigin: 'https://games.jussco.company',
    journey: 'sync-party',
    manifest: MANIFEST_PATH,
    actorCount: 2,
    stepCount: 53,
    actionScope: 'synthetic-playwright-public-journey',
    browserExecuted: false,
    approvalIssued: false,
    mergeAuthorized: false,
    deployAuthorized: false,
    writeAuthorization: false,
    nextGate: 'Exact manifest fingerprint and separate founder run authorization in execution control plane',
  };
}
