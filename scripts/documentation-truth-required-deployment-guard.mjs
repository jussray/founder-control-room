const REQUIRED_DEPLOYMENT = /required[- ]deploy(?:ment|ments)?/i;
const PRESERVATION = /(?:preserv(?:e|es|ed|ing)|retain(?:s|ed|ing)?|keep(?:s|ing)?|kept|remain(?:s|ed|ing)?|unchanged)/i;
const AFFIRMATIVE_REMOVAL = /(?:remove(?:s|d|ing)?|drop(?:s|ped|ping)?|delete(?:s|d|ing)?)/i;
const NEGATED_REMOVAL = /(?:must|should|do|does|did|can|cannot|could|may)\s+not\s+(?:silently\s+)?(?:remove|drop|delete)/i;
const MIGRATION_DEBT = /migration\s+debt/i;
const RELATION_WINDOW = 180;

function normalizeClaim(value) {
  return String(value)
    .replace(/[\`*>#~\[\]{}()]/g, ' ')
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function related(left, right, text) {
  const leftSource = left.source;
  const rightSource = right.source;
  return new RegExp(
    `(?:${leftSource})[^.!?]{0,${RELATION_WINDOW}}(?:${rightSource})|(?:${rightSource})[^.!?]{0,${RELATION_WINDOW}}(?:${leftSource})`,
    'i',
  ).test(text);
}

export function claimAffirmativelyRemovesRequiredDeployments(claim) {
  const text = normalizeClaim(claim);
  if (!REQUIRED_DEPLOYMENT.test(text)) return false;

  // A receipt cannot certify removal while also preserving, retaining, keeping,
  // or leaving the same required-deployment rule unchanged.
  if (related(PRESERVATION, REQUIRED_DEPLOYMENT, text)) return false;

  // "must not remove" / equivalent negation is contradictory even when a
  // different removal keyword appears elsewhere in the same claim.
  if (NEGATED_REMOVAL.test(text)) return false;

  return related(AFFIRMATIVE_REMOVAL, REQUIRED_DEPLOYMENT, text)
    || related(MIGRATION_DEBT, REQUIRED_DEPLOYMENT, text);
}

export function receiptClaimsDescribeRequiredDeploymentRemoval(claims) {
  return Array.isArray(claims)
    && claims.some((claim) => claimAffirmativelyRemovesRequiredDeployments(claim));
}
