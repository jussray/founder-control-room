export type UltrathinkRiskTier = 'l0' | 'l1' | 'l2' | 'l3';

export interface UltrathinkDeclaredImpact {
  domains: readonly string[];
  riskTier: UltrathinkRiskTier;
}

export interface UltrathinkObservedImpact {
  baseSha: string;
  candidateSha: string;
  changedPaths: readonly string[];
  affectedDomains: readonly string[];
  riskTier: UltrathinkRiskTier;
  observedAt: string;
}

export type UltrathinkImpactStatus =
  | 'within_declared_scope'
  | 'scope_exceeded'
  | 'malformed';

export interface UltrathinkImpactEvaluation {
  status: UltrathinkImpactStatus;
  reason: string;
  addedDomains: readonly string[];
  riskEscalated: boolean;
}

const RISK_ORDER: Record<UltrathinkRiskTier, number> = {
  l0: 0,
  l1: 1,
  l2: 2,
  l3: 3,
};

function normalizeDomains(domains: readonly string[]): string[] {
  return [...new Set(domains.map((value) => value.trim()).filter(Boolean))].sort();
}

export function evaluateObservedImpact(
  declared: UltrathinkDeclaredImpact,
  observed: UltrathinkObservedImpact,
): UltrathinkImpactEvaluation {
  if (
    !observed.baseSha.trim()
    || !observed.candidateSha.trim()
    || !observed.observedAt.trim()
    || observed.changedPaths.length === 0
  ) {
    return {
      status: 'malformed',
      reason: 'repository-observed impact is incomplete',
      addedDomains: [],
      riskEscalated: false,
    };
  }

  const declaredDomains = normalizeDomains(declared.domains);
  const observedDomains = normalizeDomains(observed.affectedDomains);
  const declaredSet = new Set(declaredDomains);
  const addedDomains = observedDomains.filter((domain) => !declaredSet.has(domain));
  const riskEscalated = RISK_ORDER[observed.riskTier] > RISK_ORDER[declared.riskTier];

  if (addedDomains.length > 0 || riskEscalated) {
    return {
      status: 'scope_exceeded',
      reason: 'repository-observed blast radius exceeds declared impact',
      addedDomains,
      riskEscalated,
    };
  }

  return {
    status: 'within_declared_scope',
    reason: 'repository-observed blast radius remains within declared impact',
    addedDomains: [],
    riskEscalated: false,
  };
}
