import type {
  FundraisingAttack3000Input,
  FundraisingAttack3000Result,
  FundraisingCapitalScope,
} from '../ultrathink-core/attack3000Fundraising.js';

export const FOUNDER_CAPITAL_DECISION_CARD_CONTRACT =
  'juss-v10/founder-capital-decision-card@v1' as const;

export interface FounderCapitalDecisionContext {
  milestoneUnlocked: string;
  nextFinancingTrigger: string;
  expectedRunwayMonths: number;
}

export interface FounderCapitalDecisionCard {
  contract: typeof FOUNDER_CAPITAL_DECISION_CARD_CONTRACT;
  adapterId: string;
  decisionId: string;
  scope: FundraisingCapitalScope | null;
  asOf: string | null;
  planning: {
    milestoneUnlocked: string;
    nextFinancingTrigger: string;
    expectedRunwayMonths: number;
  };
  capital: {
    classification: FundraisingAttack3000Result['terms']['classification'];
    currency: string | null;
    preMoneyValuationCents: number | null;
    capitalNeededCents: number | null;
    postMoneyValuationCents: number | null;
    impliedDilutionPct: number | null;
    retainedOwnershipPct: number | null;
  };
  termBurden: {
    classification: FundraisingAttack3000Result['termBurden']['classification'];
    completeness: FundraisingAttack3000Result['termBurden']['completeness'];
    instrument: string | null;
  };
  optionality: {
    classification: FundraisingAttack3000Result['optionality']['classification'];
    state: FundraisingAttack3000Result['optionality']['state'];
    preservedOptions: string[];
    weakenedOptions: string[];
    addedOptions: string[];
  };
  verdict: {
    state: FundraisingAttack3000Result['evaluation']['verdict'];
    reasons: string[];
  };
  diagnostics: {
    terms: string[];
    termBurden: string[];
    optionality: string[];
  };
  authority: FundraisingAttack3000Result['evaluation']['authority'];
  proof: {
    evidenceRefs: string[];
  };
  nextMove: string;
}

function nextCapitalMove(
  verdict: FundraisingAttack3000Result['evaluation']['verdict'],
): string {
  if (verdict === 'FALSIFIED') {
    return 'Stop this financing path under the current founder-defined ceiling or falsifier.';
  }
  if (verdict === 'SUPPORTED') {
    return 'Founder review is still required; this evidence verdict grants no financing authority.';
  }
  return 'Resolve the listed evidence gaps before treating this capital path as supported.';
}

/**
 * Founder-facing view model for the Attack 1000-hardened fundraising adapter.
 * This card is descriptive only. It never grants spend, contact, fundraising,
 * merge, publish, deploy, or execution authority.
 */
export function founderCapitalDecisionCardFromFundraising(
  context: FounderCapitalDecisionContext,
  input: FundraisingAttack3000Input,
  result: FundraisingAttack3000Result,
): FounderCapitalDecisionCard {
  const evidenceRefs = [
    ...result.terms.evidenceRefs,
    ...result.termBurden.evidenceRefs,
    ...result.optionality.evidenceRefs,
  ].filter((ref, index, values) => ref && values.indexOf(ref) === index);

  return {
    contract: FOUNDER_CAPITAL_DECISION_CARD_CONTRACT,
    adapterId: result.assessment.adapterId,
    decisionId: result.assessment.subject.decisionId,
    scope: input.terms.context?.expectedScope ?? null,
    asOf: input.terms.context?.asOf ?? null,
    planning: {
      milestoneUnlocked: context.milestoneUnlocked,
      nextFinancingTrigger: context.nextFinancingTrigger,
      expectedRunwayMonths: context.expectedRunwayMonths,
    },
    capital: {
      classification: result.terms.classification,
      currency: result.terms.currency,
      preMoneyValuationCents: input.terms.preMoneyValuation.amountCents,
      capitalNeededCents: input.terms.raiseAmount.amountCents,
      postMoneyValuationCents: result.terms.postMoneyValuationCents,
      impliedDilutionPct: result.terms.impliedDilutionPct,
      retainedOwnershipPct: result.terms.retainedOwnershipPct,
    },
    termBurden: {
      classification: result.termBurden.classification,
      completeness: result.termBurden.completeness,
      instrument: result.termBurden.instrument,
    },
    optionality: {
      classification: result.optionality.classification,
      state: result.optionality.state,
      preservedOptions: [...result.optionality.preservedOptions],
      weakenedOptions: [...result.optionality.weakenedOptions],
      addedOptions: [...result.optionality.addedOptions],
    },
    verdict: {
      state: result.evaluation.verdict,
      reasons: [...result.evaluation.reasons],
    },
    diagnostics: {
      terms: [...result.terms.reasons],
      termBurden: [...result.termBurden.reasons],
      optionality: [...result.optionality.reasons],
    },
    authority: result.evaluation.authority,
    proof: {
      evidenceRefs,
    },
    nextMove: nextCapitalMove(result.evaluation.verdict),
  };
}
