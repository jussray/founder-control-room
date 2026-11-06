const REQUIRED_DEPLOYMENT = /required[- ]deploy(?:ments|ment)?\b/gi;
const OPERATION = /\b(preserv(?:e|es|ed|ing)|retain(?:s|ed|ing)?|keep(?:s|ing)?|kept|remove(?:s|d|ing)?|drop(?:s|ped|ping)?|delete(?:s|d|ing)?)\b/gi;
const PRESERVATION_OPERATION = /^(?:preserv|retain|keep|kept)/i;
const REMOVAL_OPERATION = /^(?:remove|drop|delete)/i;
const NEGATION_NEAR_OPERATION = /\b(?:must|should|shall|do|does|did|can|cannot|could|may|will)\s+not(?:\s+silently)?\s*$/i;
const SUBJECT_PRESERVATION = /^(?:\s+(?:rule|rules))?\s+(?:(?:must|should|shall|will)\s+)?(?:(?:be|remain|remains|stay|stays)\s+)?(?:preserved|retained|kept|unchanged)\b/i;
const SUBJECT_NEGATED_REMOVAL = /^(?:\s+(?:rule|rules))?\s+(?:must|should|shall|will|may)\s+not\s+(?:be\s+)?(?:removed|dropped|deleted)\b/i;
const SUBJECT_AFFIRMATIVE_REMOVAL = /^(?:\s+(?:rule|rules))?\s+(?:(?:must|should|shall|will)\s+)?(?:be\s+)?(?:removed|dropped|deleted)\b/i;
const SUBJECT_MIGRATION_DEBT = /^(?:\s+(?:rule|rules))?\s+(?:(?:is|are|be|becomes?|remains?)\s+)?(?:[a-z-]+\s+){0,3}migration\s+debt\b/i;
const CLAIM_BOUNDARY = /[.!?;,]/g;

function normalizeClaim(value) {
  return String(value)
    .replace(/[\`*>#~\[\]{}()]/g, ' ')
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function segmentStart(text, index) {
  let start = 0;
  CLAIM_BOUNDARY.lastIndex = 0;
  for (const match of text.matchAll(CLAIM_BOUNDARY)) {
    if (match.index >= index) break;
    start = match.index + match[0].length;
  }
  return start;
}

function segmentEnd(text, index) {
  CLAIM_BOUNDARY.lastIndex = 0;
  for (const match of text.matchAll(CLAIM_BOUNDARY)) {
    if (match.index > index) return match.index;
  }
  return text.length;
}

function nearestOperationBefore(text, occurrenceStart) {
  const start = segmentStart(text, occurrenceStart);
  const before = text.slice(start, occurrenceStart);
  let nearest = null;
  OPERATION.lastIndex = 0;
  for (const match of before.matchAll(OPERATION)) {
    nearest = { verb: match[1], index: match.index ?? 0, source: before };
  }
  return nearest;
}

function operationIsNegated(operation) {
  if (!operation) return false;
  const prefix = operation.source.slice(Math.max(0, operation.index - 40), operation.index);
  return NEGATION_NEAR_OPERATION.test(prefix);
}

function classifyOccurrence(text, match) {
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const after = text.slice(end, segmentEnd(text, end));

  // Explicit subject-bound disposition is authoritative for this occurrence.
  // A prior verb may describe another rule or an earlier deployment mention,
  // so it must never override "required_deployments must be removed" or
  // "required_deployments must remain unchanged".
  if (SUBJECT_NEGATED_REMOVAL.test(after)) return 'contradictory';
  if (SUBJECT_PRESERVATION.test(after)) return 'contradictory';
  if (SUBJECT_AFFIRMATIVE_REMOVAL.test(after)) return 'affirmative';
  if (SUBJECT_MIGRATION_DEBT.test(after)) return 'affirmative';

  const beforeOperation = nearestOperationBefore(text, start);
  if (beforeOperation) {
    if (PRESERVATION_OPERATION.test(beforeOperation.verb)) return 'contradictory';
    if (REMOVAL_OPERATION.test(beforeOperation.verb)) {
      return operationIsNegated(beforeOperation) ? 'contradictory' : 'affirmative';
    }
  }

  return 'neutral';
}

export function classifyRequiredDeploymentClaim(claim) {
  const text = normalizeClaim(claim);
  const matches = [...text.matchAll(REQUIRED_DEPLOYMENT)];
  if (matches.length === 0) return 'irrelevant';

  let sawAffirmative = false;
  for (const match of matches) {
    const classification = classifyOccurrence(text, match);
    if (classification === 'contradictory') return 'contradictory';
    if (classification === 'affirmative') sawAffirmative = true;
  }
  return sawAffirmative ? 'affirmative' : 'neutral';
}

export function claimAffirmativelyRemovesRequiredDeployments(claim) {
  return classifyRequiredDeploymentClaim(claim) === 'affirmative';
}

export function receiptClaimsDescribeRequiredDeploymentRemoval(claims) {
  if (!Array.isArray(claims)) return false;

  let sawAffirmative = false;
  for (const claim of claims) {
    const classification = classifyRequiredDeploymentClaim(claim);
    if (classification === 'contradictory' || classification === 'neutral') return false;
    if (classification === 'affirmative') sawAffirmative = true;
  }
  return sawAffirmative;
}
