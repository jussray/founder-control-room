import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_FILES = Object.freeze([
  'README.md',
  '.agents/skills/sauce-guard/SKILL.md',
  'docs/SAUCE_GUARD.md',
  'docs/SOURCE_GUARD.md',
  'docs/PORTFOLIO_CONVERSION_TRACKING.md',
  'docs/FOUNDER_MERGE_AUTHORITY.md',
  'config/conversion-tracking.contract.json',
]);

const EVENTS = ['call_click', 'whatsapp_click', 'pickup_request', 'directions_click'];
const IDENTITY_FIELDS = ['email', 'phone_number', 'ip_address', 'user_agent', 'cookie', 'device_id', 'browser_fingerprint', 'user_id'];
const SENSITIVE_MARKER = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|sk-[a-zA-Z0-9_-]{12,})[a-zA-Z0-9_-]{16,}|(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*[^\s]{8,}/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dated(value) {
  return typeof value === 'string' && ISO_DATE.test(value)
    && !Number.isNaN(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

// Review aid only: accepted claims are NOT authorized for publication.
export function validatePublicDraft(draft) {
  const errors = [];
  if (!draft || !Array.isArray(draft.claims) || draft.claims.length === 0) {
    return ['claims must be a non-empty array'];
  }
  for (const [index, claim] of draft.claims.entries()) {
    const label = 'claim[' + index + ']';
    if (!claim || typeof claim !== 'object' || typeof claim.text !== 'string' || !claim.text.trim()) {
      errors.push(label + ': non-empty text required');
      continue;
    }
    if (SENSITIVE_MARKER.test(claim.text)) errors.push(label + ': possible credential marker');
    if (claim.status !== 'CURRENT' && claim.status !== 'HISTORICAL') {
      errors.push(label + ': only CURRENT or honestly framed HISTORICAL allowed');
    }
    if (claim.status === 'CURRENT') {
      if (typeof claim.evidenceRef !== 'string' || claim.evidenceRef.trim().length < 8) {
        errors.push(label + ': CURRENT requires an evidence reference');
      }
      if (!dated(claim.observedOn)) errors.push(label + ': CURRENT requires a valid observedOn date');
    }
    if (claim.status === 'HISTORICAL' && !dated(claim.asOf)) {
      errors.push(label + ': HISTORICAL requires a valid asOf date');
    }
  }
  return errors;
}

// Deterministic, side-effect-free review of selected repository policy evidence.
export function evaluateRepositorySources(files) {
  const errors = [];
  for (const file of SOURCE_FILES) {
    if (typeof files[file] !== 'string' || !files[file].trim()) errors.push('missing or empty: ' + file);
  }
  if (errors.length) return errors;
  const requireText = (file, phrase) => {
    if (!files[file].toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(file + ': missing boundary: ' + phrase);
    }
  };
  requireText('README.md', '## Sauce Guard + Source Guard');
  requireText('README.md', '(docs/SAUCE_GUARD.md)');
  requireText('README.md', '(docs/SOURCE_GUARD.md)');
  requireText('README.md', 'does **not** establish');

  const skill = '.agents/skills/sauce-guard/SKILL.md';
  for (const term of ['verified product evidence', 'Current You approves', 'provider readback', 'Private customer or user information', 'Never publish']) {
    requireText(skill, term);
  }
  for (const term of ['SOURCE IMPLEMENTED', 'founder approval', 'do not prove', 'SOURCE_GUARD.md']) {
    requireText('docs/SAUCE_GUARD.md', term);
  }
  for (const term of ['SOURCE IMPLEMENTED', 'CONFIGURED', 'ACTIVE', 'PROVEN', 'review helper', 'Founder Merge Authority']) {
    requireText('docs/SOURCE_GUARD.md', term);
  }
  requireText('docs/PORTFOLIO_CONVERSION_TRACKING.md', 'SITE_WIRING_NOT_PROVEN');
  requireText('docs/PORTFOLIO_CONVERSION_TRACKING.md', 'CONVERSION_OUTCOMES_NOT_PROVEN');
  requireText('docs/FOUNDER_MERGE_AUTHORITY.md', 'fresh, explicit founder approval');
  requireText('docs/FOUNDER_MERGE_AUTHORITY.md', 'base SHA');
  requireText('docs/FOUNDER_MERGE_AUTHORITY.md', 'head SHA');

  let contract;
  try { contract = JSON.parse(files['config/conversion-tracking.contract.json']); }
  catch { return [...errors, 'conversion contract must be valid JSON']; }
  if (JSON.stringify(contract.eventNames) !== JSON.stringify(EVENTS)) {
    errors.push('conversion event allowlist changed');
  }
  const forbidden = new Set(contract.forbiddenPayloadFields || []);
  const allowed = new Set(contract.allowedPayloadFields || []);
  for (const field of IDENTITY_FIELDS) {
    if (!forbidden.has(field)) errors.push('identity field not forbidden: ' + field);
    if (allowed.has(field)) errors.push('identity field allowed: ' + field);
  }
  if (contract.retention?.automaticDeletionEnabled !== false ||
      contract.retention?.deletionRequiresExplicitFounderApproval !== true) {
    errors.push('conversion history deletion approval boundary changed');
  }
  if (contract.inputPolicy?.rejectUnknownProjects !== true ||
      contract.inputPolicy?.apiOriginBoundByProject !== true) {
    errors.push('conversion project/origin boundary changed');
  }
  return errors;
}

export function readRepositorySources(root = process.cwd()) {
  return Object.fromEntries(SOURCE_FILES.map((file) => [
    file, readFileSync(resolve(root, file), 'utf8'),
  ]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = evaluateRepositorySources(readRepositorySources());
    if (errors.length) {
      for (const error of errors) console.error('SAUCE_SOURCE_GUARD_FAIL: ' + error);
      process.exitCode = 1;
    } else {
      console.log('SAUCE_SOURCE_GUARD_PASS: source boundaries only; no runtime/publication proof');
    }
  } catch (error) {
    console.error('SAUCE_SOURCE_GUARD_FAIL: ' + String(error.message || error));
    process.exitCode = 1;
  }
}
