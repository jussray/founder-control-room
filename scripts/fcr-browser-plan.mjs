#!/usr/bin/env node
/**
 * Natural-language preview routing for founder-owned, source-reviewed
 * browser journeys. This command NEVER performs browser or provider actions.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJourney } from './fcr-browser-journey.mjs';

const MAX_REQUEST_LENGTH = 500;
const SUPPORTED_INTENTS = Object.freeze([
  {
    id: 'sync-party',
    project: 'sync-party-game',
    hostname: 'games.jussco.company',
    manifest: 'config/browser-journeys/sync-party.json',
    triggers: [/\bgames\.jussco\.company\b/i, /\bsync[\s-]+party\b/i, /\bsync-party-game\b/i]
  }
]);

// A web agent must never infer permissions from a freeform input. Reject
// additional, irreversible, credentialed, unrelated, or private-data requests.
const DENIED_INTENTS = [
  /\b(?:delete|wipe|erase|destroy|remove|reset|drop|truncate)\b/i,
  /\b(?:merge|deploy|publish|release|ship|rollback|revert|commit|push|pull request|pr\b|branch)\b/i,
  /\b(?:purchase|buy|pay|checkout|transfer|invoice|refund|order|subscribe)\b/i,
  /\b(?:email|message|dm\b|sms|post|share|send|upload|download|export|scrape|crawl)\b/i,
  /\b(?:login|log in|sign in|password|credential|secret|api key|access token|cookie|session storage|localstorage)\b/i,
  /\b(?:admin|dashboard|private|parent|minor|journal|voice note|health record|user data|database|supabase)\b/i,
  /\b(?:javascript|execute code|eval|shell|terminal|command|fetch|request headers|webhook|endpoint)\b/i,
  /\b(?:ignore instructions|override|bypass|disable safety|no approval|without approval)\b/i
];
const TEST_START = /^(?:please\s+)?(?:test|verify|check|audit|run(?:\s+a)?\s+test)\b/i;

/**
 * Turn one bounded request into a non-executing manifest preview.
 * Unknown or mixed intents always fail closed.
 */
export function routeBrowserRequest(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_REQUEST_LENGTH || raw.trim().length < 12) {
    return { status: 'REJECTED', reason: 'INVALID_REQUEST', browserExecuted: false };
  }
  const request = raw.trim();
  if (!TEST_START.test(request)) {
    return { status: 'REJECTED', reason: 'UNSUPPORTED_INTENT', browserExecuted: false };
  }
  if (DENIED_INTENTS.some((rule) => rule.test(request))) {
    return { status: 'REJECTED', reason: 'MIXED_OR_UNSAFE_INTENT', browserExecuted: false };
  }
  if (/[<>\\{}]|https?:\/\/[^\s"']+@/i.test(request)) {
    return { status: 'REJECTED', reason: 'UNTRUSTED_SYNTAX', browserExecuted: false };
  }
  const hits = SUPPORTED_INTENTS.filter((route) => route.triggers.some((pattern) => pattern.test(request)));
  if (hits.length !== 1) {
    return { status: 'REJECTED', reason: hits.length ? 'AMBIGUOUS_PROJECT' : 'UNKNOWN_PROJECT', browserExecuted: false };
  }
  // A request naming an additional hostname cannot be routed to a single project.
  const explicitHosts = [...request.matchAll(/\b(?:[a-z0-9-]+\.)+(?:company|org|net|com|app)\b/gi)]
    .map((match) => match[0].toLowerCase());
  if (explicitHosts.some((host) => host !== hits[0].hostname)) {
    return { status: 'REJECTED', reason: 'CROSS_PROJECT_REQUEST', browserExecuted: false };
  }
  return {
    status: 'ROUTED_FOR_PREVIEW',
    journey: hits[0].id,
    project: hits[0].project,
    manifest: hits[0].manifest,
    browserExecuted: false
  };
}

export async function previewBrowserRequest(request, loadManifest) {
  const route = routeBrowserRequest(request);
  if (route.status !== 'ROUTED_FOR_PREVIEW') return route;
  assert.equal(typeof loadManifest, 'function');
  const jsonText = await loadManifest(route.manifest);
  const manifest = JSON.parse(jsonText);
  const check = validateJourney(manifest);
  assert.equal(check.project, route.project, 'Manifest must match routed project');
  assert.equal(new URL(check.origin).hostname, SUPPORTED_INTENTS.find((item) => item.id === route.journey).hostname);
  const digest = createHash('sha256').update(jsonText).digest('hex');
  // No raw request strings, form data, captured DOM, secret or cookie enters the receipt.
  return {
    contract: 'fcr/browser-plan-preview@v1',
    status: 'REQUIRES_FOUNDER_RUN_APPROVAL',
    journey: route.journey,
    project: route.project,
    target: check.origin,
    manifest: route.manifest,
    manifestSha256: digest,
    actors: check.actors,
    steps: check.steps,
    syntheticActionsMayWriteTestData: true,
    browserExecuted: false,
    providerMutationAuthorized: false,
    mergeAuthorized: false,
    deployAuthorized: false,
    nextAction: 'Review manifest; separately authorize an exact run under the project policy'
  };
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--request') {
    throw new Error('Usage: node scripts/fcr-browser-plan.mjs --request "Test the Sync Party user journey"');
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await previewBrowserRequest(process.argv[3], async (relativePath) => {
    const manifestPath = path.resolve(root, relativePath);
    const approvedDir = path.join(root, 'config/browser-journeys');
    if (path.dirname(manifestPath) !== approvedDir || !manifestPath.endsWith('.json')) {
      throw new Error('Only source-reviewed journey manifests can be previewed');
    }
    return readFile(manifestPath, 'utf8');
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'REQUIRES_FOUNDER_RUN_APPROVAL') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => {
    console.error('Browser preview failed closed. No browser actions were executed.');
    process.exitCode = 1;
  });
}
