const REQUIRED_DEPLOYMENT = /required[- ]deploy(?:ment|ments)?/i;
const PRESERVATION = /(?:preserv(?:e|es|ed|ing)|retain(?:s|ed|ing)?|keep(?:s|ing)?|kept|remain(?:s|ed|ing)?|unchanged)/i;
const AFFIRMATIVE_REMOVAL = /(?:remove(?:s|d|ing)?|drop(?:s|ped|ping)?|delete(?:s|d|ing)?)/i;
const NEGATED_REMOVAL = /(?:must|should|do|does|did|can|cannot|could|may)\s+not\s+(?:silently\s+)?(?:remove|drop|delete)/i;
const MIGRATION_DEBT = /migration\s+debt/i;
function normalizeClaim(value) {
  return String(value)
    .replace(/[\`*>#~\[\]{}()]/g, ' ')
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function requiredDeploymentClauses(value) {
  return normalizeClaim(value)
    .split(/[;,]/u)
    .map((clause) => clause.trim())
    .filter((clause) => REQUIRED_DEPLOYMENT.test(clause));
}

export function claimAffirmativelyRemovesRequiredDeployments(claim) {
  const clauses = requiredDeploymentClauses(claim);
  if (clauses.length === 0) return false;

  let sawAffirmativeRemoval = false;
  for (const clause of clauses) {
    // Evaluate only the clause that actually names required_deployments. This
    // avoids treating "preserve code-quality ... unchanged, intentionally
    // remove required_deployments" as contradictory while still rejecting
    // preservation semantics tied to the deployment rule itself.
    if (PRESERVATION.test(clause)) return false;
    if (NEGATED_REMOVAL.test(clause)) return false;
    if (AFFIRMATIVE_REMOVAL.test(clause) || MIGRATION_DEBT.test(clause)) {
      sawAffirmativeRemoval = true;
    }
  }

  return sawAffirmativeRemoval;
}

export function receiptClaimsDescribeRequiredDeploymentRemoval(claims) {
  return Array.isArray(claims)
    && claims.some((claim) => claimAffirmativelyRemovesRequiredDeployments(claim));
}
