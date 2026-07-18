import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readText(path) {
  return readFileSync(resolve(root, path), 'utf8');
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
const planPath = 'docs/private/UNIFIED_GROWTH_INBOX_PLAN.md';
const compliancePath = 'docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md';
const typePath = 'src/types/growthInbox.ts';

const registry = readJson(registryPath);
const skill = readText(skillPath);
const plan = readText(planPath);
const compliance = readText(compliancePath);
const types = readText(typePath);

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
  'Revenue only when actually collected',
]) {
  assert(skill.includes(phrase), `skill contract missing phrase: ${phrase}`);
}

for (const phrase of [
  'Do not build ten unrelated bots',
  'A contact for Juss Beautiful Hair is not silently marketed Se’kret Bip',
  'No unrestricted cold outreach mode exists',
  'actually collected revenue',
]) {
  assert(plan.includes(phrase), `private plan missing phrase: ${phrase}`);
}

for (const phrase of [
  'No external message, call, campaign step, or automated reply may be dispatched',
  'Revenue is real only when collected and attributable',
  'Pennsylvania registration, bonding, list subscription',
  'Google discontinued the product on',
]) {
  assert(compliance.includes(phrase), `compliance gate missing phrase: ${phrase}`);
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
