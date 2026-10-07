import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readText(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

/** Collapses markdown soft line-wraps so phrase checks survive prose reflow. */
function normalizeProse(text) {
  return text.replace(/\s+/g, ' ');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const registryPath = 'config/unified-growth-inbox.channels.json';
const skillPath = '.ai/skills/unified-growth-inbox/SKILL.md';
const typePath = 'src/types/growthInbox.ts';
const filingSourcePath = 'src/lib/growthInboxReply.ts';
const workerEntryPath = 'src/worker/cf-entry.ts';
const workerConfigPath = 'wrangler.worker.toml';
const messagingRoutePath = 'src/http/routes/pluginCenterMessaging.ts';
const callbackSourcePath = 'src/http/routes/onboardingAssets/callbackJs.ts';

const registry = readJson(registryPath);
const skill = normalizeProse(readText(skillPath));
const types = readText(typePath);
const filingSource = readText(filingSourcePath);
const workerEntry = readText(workerEntryPath);
const workerConfig = readText(workerConfigPath);
const messagingRoute = readText(messagingRoutePath);
const callbackSource = readText(callbackSourcePath);

assert(registry.defaultAutomationMode === 'draft_only', 'default automation mode must remain draft_only');
assert(registry.globalRules?.coldOutreachEnabled === false, 'cold outreach must remain disabled');
assert(registry.globalRules?.crossProjectTargetingEnabled === false, 'cross-project targeting must remain disabled');
assert(registry.globalRules?.sensitiveDataSalesUseEnabled === false, 'sensitive-data sales use must remain disabled');
assert(registry.globalRules?.purchasedScrapedOrInferredListsAllowed === false, 'purchased/scraped/inferred lists must remain forbidden');
assert(registry.globalRules?.proofOfConsentRequired === true, 'proof of consent must be required');
assert(registry.globalRules?.auditAndIdempotencyRequiredBeforeDispatch === true, 'audit and idempotency must be required before dispatch');
assert(registry.legalPolicyGate?.failClosedOnUnknown === true, 'legal policy gate must fail closed');
assert(registry.legalPolicyGate?.pennsylvaniaTelemarketing?.outboundSalesCallsEnabled === false, 'Pennsylvania outbound sales calls must remain disabled');
assert(registry.channels?.voice_calls?.outboundSupported === false, 'voice outbound must remain disabled');
assert(registry.channels?.google_business_messages?.status === 'retired_do_not_build', 'Google Business Messages must remain retired/do-not-build');
assert(registry.revenueAccounting?.recognizedRevenueState === 'payment_collected', 'only collected payment may be recognized as revenue');
assert(registry.forbidden?.includes('reporting_uncollected_value_as_revenue'), 'uncollected value must not be reported as revenue');


const emailFiling = registry.emailFiling;
assert(emailFiling?.provider === 'gmail', 'email filing provider must remain gmail');
assert(emailFiling?.centralInbox === 'sekretbip@gmail.com', 'project mail must converge on the central founder inbox');
assert(emailFiling?.strategy === 'original_recipient_domain', 'project filing must use the original recipient domain');
assert(emailFiling?.defaultAction === 'leave_unfiled_in_inbox', 'unknown project mail must remain visible and unfiled');
assert(emailFiling?.preserveInbox === true, 'project filing must not archive by default');
assert(emailFiling?.preserveUnread === true, 'project filing must preserve unread state');
assert(emailFiling?.crossProjectLabeling === false, 'cross-project mail labeling must remain disabled');
assert(emailFiling?.persistentMechanism === 'gmail_filter_rules', 'persistent project filing must use Gmail filter rules');
assert(emailFiling?.runtimeEnableFlag === 'FCR_GMAIL_PROJECT_FILING_ENABLED', 'email filing runtime gate must remain explicit');
assert(emailFiling?.enabledByDefault === false, 'persistent Gmail filing must fail closed by default');
assert(emailFiling?.activationMode === 'one_time_founder_oauth', 'Gmail filing must activate through one-time founder OAuth');
assert(
  emailFiling?.oauthScope === 'https://www.googleapis.com/auth/gmail.settings.basic',
  'Gmail filing must request only the settings.basic scope',
);
assert(
  emailFiling?.providerTokenRetention === 'discard_after_filter_reconciliation',
  'Google provider token must be discarded after filter reconciliation',
);
for (const requirement of [
  'explicit_runtime_enablement',
  'owned_google_oauth_if_drift_reconciliation_is_enabled',
  'verified_expected_account',
]) {
  assert(
    emailFiling?.backgroundAutofilingRequires?.includes(requirement),
    `background autofiling missing requirement: ${requirement}`,
  );
}

const filingRules = Array.isArray(emailFiling?.rules) ? emailFiling.rules : [];
const filingByDomain = new Map(filingRules.map((rule) => [rule.recipientDomain, rule]));
assert(filingByDomain.size === filingRules.length, 'email filing recipient domains must be unique');

for (const [domain, projectId, labelName, labelId] of [
  ['foundercontrolroom.org', 'founder-control-room', 'FCR / Mail', 'Label_29'],
  ['jussco.company', 'jussco', 'JussCo / Mail', 'Label_30'],
  ['jussbeautifulhair.com', 'juss-beautiful-hair', 'JBH / Mail', 'Label_31'],
  ['sekretbip.net', 'sekret-bip', "Se'kret Bip / Mail", 'Label_32'],
]) {
  const rule = filingByDomain.get(domain);
  assert(rule, `missing project email filing rule for ${domain}`);
  assert(rule.projectId === projectId, `wrong project binding for ${domain}`);
  assert(rule.labelName === labelName, `wrong Gmail label for ${domain}`);
  assert(rule.labelId === labelId, `wrong live Gmail label ID for ${domain}`);
  assert(rule.matchScope === 'domain_all_aliases', `email filing must cover every alias at ${domain}`);
}

assert(!filingByDomain.has('jussbeatifulhair.com'), 'misspelled JBH domain must never become a filing authority');

for (const rule of filingRules) {
  for (const value of [rule.projectId, rule.recipientDomain, rule.labelName, rule.labelId]) {
    assert(filingSource.includes(value), `Gmail filing runtime missing canonical value: ${value}`);
  }
}
assert(
  filingSource.includes("action: { addLabelIds: [rule.labelId] }"),
  'Gmail filing runtime must add only the pinned project label',
);
assert(!filingSource.includes("`${GMAIL_API}/labels`"), 'one-time Gmail filing must not require label-management API access');
assert(
  filingSource.includes("GMAIL_PROJECT_FILING_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic'"),
  'runtime must pin the least-privilege Gmail settings scope',
);
assert(
  filingSource.includes('GMAIL_PROJECT_FILING_FILTER_CONFLICT'),
  'Gmail filing runtime must fail closed on conflicting existing filters',
);
assert(
  workerConfig.includes('FCR_GMAIL_PROJECT_FILING_ENABLED = "false"'),
  'production Gmail filing flag must remain disabled until owned OAuth is ready',
);
assert(
  workerEntry.includes('reconcileGmailProjectFilingFilters()')
    && workerEntry.includes("name: 'gmail-project-filing'"),
  'governed Worker cron must carry the Gmail filing reconciler',
);
assert(
  messagingRoute.includes("'/gmail/filing/connect'")
    && messagingRoute.includes("'/gmail/filing/activate'"),
  'Plugin Center must expose the founder-gated one-time Gmail filing flow',
);
assert(
  messagingRoute.includes("status: 'disconnected'")
    && messagingRoute.includes('tokenRetained: false'),
  'Gmail connection must remain disconnected after one-time activation and retain no provider token',
);
const callbackScrub = callbackSource.indexOf("history.replaceState(null,'','/auth/callback')");
const callbackActivation = callbackSource.indexOf('/plugin-center/messaging/gmail/filing/activate');
assert(callbackScrub >= 0 && callbackActivation > callbackScrub, 'OAuth callback must scrub token-bearing URL before Gmail activation');
assert(!callbackSource.includes('localStorage'), 'OAuth callback must not persist provider tokens in localStorage');

const requiredChecks = new Set(registry.legalPolicyGate?.requiredChecks ?? []);
for (const check of [
  'consent_evidence_retained',
  'global_project_channel_and_campaign_suppression_clear',
  'jurisdiction_rules_resolved',
  'sender_campaign_or_telemarketer_registration_resolved',
  'content_offer_and_claims_approved',
  'idempotency_and_dispatch_audit_ready',
]) {
  assert(requiredChecks.has(check), `missing legal dispatch check: ${check}`);
}

for (const phrase of [
  'default operating mode is `draft_only`',
  'No level authorizes unrestricted autonomous outreach',
  'Never ingest into growth or sales analysis',
  'revenue only when actually collected',
]) {
  assert(skill.includes(phrase), `skill contract missing phrase: ${phrase}`);
}

for (const phrase of [
  "export interface GrowthChannelAdapter",
  "export interface DispatchDecision",
  "return decision.checks.every((check) => check.state === 'allow')",
  "record.revenueState === 'payment_collected'",
]) {
  assert(types.includes(phrase), `typed contract missing phrase: ${phrase}`);
}

console.log('Unified Growth Inbox contract verification passed.');
console.log(`Channels registered: ${Object.keys(registry.channels ?? {}).length}`);
console.log(`Required dispatch checks: ${requiredChecks.size}`);
console.log('Default mode: draft_only');
console.log('Cold outreach: disabled');
console.log('Outbound voice: disabled');
console.log('Revenue recognition: payment_collected only');
console.log('Private founder plans: excluded from public verification inputs');
