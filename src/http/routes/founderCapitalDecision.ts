import type { Router } from 'express';
import {
  founderCapitalDecisionCardFromFundraising,
  type FounderCapitalDecisionContext,
} from '../../founder-os-lab/capitalDecisionCard.js';
import {
  evaluateFundraisingAttack3000,
  type FundraisingAttack3000Input,
  type FundraisingCapitalScope,
} from '../../ultrathink-core/attack3000Fundraising.js';
import type {
  Attack3000Evidence,
  Attack3000Reality,
  Attack3000Trigger,
} from '../../ultrathink-core/attack3000.js';
const CAPITAL_PREVIEW_FIELDS = new Set([
  'decisionId',
  'projectId',
  'legalEntityId',
  'capitalLaneId',
  'milestoneUnlocked',
  'nextFinancingTrigger',
  'expectedRunwayMonths',
  'currency',
  'preMoneyCents',
  'raiseAmountCents',
  'asOf',
  'observedAt',
  'maxEvidenceAgeDays',
  'instrument',
  'economicRightsKnown',
  'controlRightsKnown',
  'optionsBefore',
  'optionsAfter',
  'classification',
  'evidenceRefs',
  'maxDilutionPct',
]);

const REALITIES = new Set<Attack3000Reality>([
  'VERIFIED',
  'INFERRED',
  'UNKNOWN',
  'BLOCKED',
]);

interface CapitalPreviewPayload {
  decisionId: string;
  projectId: string;
  legalEntityId: string;
  capitalLaneId: string;
  milestoneUnlocked: string;
  nextFinancingTrigger: string;
  expectedRunwayMonths: number;
  currency: string;
  preMoneyCents: number;
  raiseAmountCents: number;
  asOf: string;
  observedAt: string;
  maxEvidenceAgeDays: number;
  instrument: string;
  economicRightsKnown: boolean;
  controlRightsKnown: boolean;
  optionsBefore: string[];
  optionsAfter: string[];
  classification: Attack3000Reality;
  evidenceRefs: string[];
  maxDilutionPct: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function boundedStringList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const normalized = boundedString(item, maximumLength);
    if (!normalized) return null;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
    ? value
    : null;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    ? value
    : null;
}

function isoTimestamp(value: unknown): string | null {
  const normalized = boundedString(value, 80);
  if (!normalized) return null;
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function parseCapitalPreviewPayload(value: unknown): CapitalPreviewPayload | null {
  if (!isRecord(value) || !hasOnlyFields(value, CAPITAL_PREVIEW_FIELDS)) return null;

  const decisionId = boundedString(value.decisionId, 200);
  const projectId = boundedString(value.projectId, 200);
  const legalEntityId = boundedString(value.legalEntityId, 200);
  const capitalLaneId = boundedString(value.capitalLaneId, 200);
  const milestoneUnlocked = boundedString(value.milestoneUnlocked, 1_000);
  const nextFinancingTrigger = boundedString(value.nextFinancingTrigger, 1_000);
  const expectedRunwayMonths = finiteNumber(value.expectedRunwayMonths, 0, 120);
  const currencyValue = boundedString(value.currency, 3)?.toUpperCase() ?? null;
  const currency = currencyValue && /^[A-Z]{3}$/.test(currencyValue) ? currencyValue : null;
  const preMoneyCents = safeInteger(value.preMoneyCents, 0);
  const raiseAmountCents = safeInteger(value.raiseAmountCents, 1);
  const asOf = isoTimestamp(value.asOf);
  const observedAt = isoTimestamp(value.observedAt);
  const maxEvidenceAgeDays = safeInteger(value.maxEvidenceAgeDays, 0, 3_650);
  const instrument = boundedString(value.instrument, 200);
  const optionsBefore = boundedStringList(value.optionsBefore, 30, 500);
  const optionsAfter = boundedStringList(value.optionsAfter, 30, 500);
  const evidenceRefs = boundedStringList(value.evidenceRefs, 30, 1_000);
  const classification =
    typeof value.classification === 'string'
    && REALITIES.has(value.classification as Attack3000Reality)
      ? value.classification as Attack3000Reality
      : null;
  const maxDilutionPct = finiteNumber(value.maxDilutionPct, 0, 100);

  if (
    !decisionId
    || !projectId
    || !legalEntityId
    || !capitalLaneId
    || !milestoneUnlocked
    || !nextFinancingTrigger
    || expectedRunwayMonths === null
    || !currency
    || preMoneyCents === null
    || raiseAmountCents === null
    || !asOf
    || !observedAt
    || maxEvidenceAgeDays === null
    || !instrument
    || typeof value.economicRightsKnown !== 'boolean'
    || typeof value.controlRightsKnown !== 'boolean'
    || !optionsBefore
    || !optionsAfter
    || !classification
    || !evidenceRefs
    || maxDilutionPct === null
  ) {
    return null;
  }

  return {
    decisionId,
    projectId,
    legalEntityId,
    capitalLaneId,
    milestoneUnlocked,
    nextFinancingTrigger,
    expectedRunwayMonths,
    currency,
    preMoneyCents,
    raiseAmountCents,
    asOf,
    observedAt,
    maxEvidenceAgeDays,
    instrument,
    economicRightsKnown: value.economicRightsKnown,
    controlRightsKnown: value.controlRightsKnown,
    optionsBefore,
    optionsAfter,
    classification,
    evidenceRefs,
    maxDilutionPct,
  };
}

function unknownEvidence(): Attack3000Evidence {
  return {
    classification: 'UNKNOWN',
    direction: 'NEUTRAL',
    evidenceRefs: [],
  };
}

function unknownFalsifier(): Attack3000Trigger {
  return {
    statement: 'No decision-specific falsifier was supplied in this focused capital preview.',
    classification: 'UNKNOWN',
    triggered: false,
    evidenceRefs: [],
  };
}

function fundraisingInput(payload: CapitalPreviewPayload): FundraisingAttack3000Input {
  const scope: FundraisingCapitalScope = {
    projectId: payload.projectId,
    legalEntityId: payload.legalEntityId,
    capitalLaneId: payload.capitalLaneId,
  };
  const observation = {
    currency: payload.currency,
    observedAt: payload.observedAt,
    scope,
    classification: payload.classification,
    evidenceRefs: payload.evidenceRefs,
  };

  return {
    subject: {
      decisionId: payload.decisionId,
      projectId: payload.projectId,
    },
    terms: {
      context: {
        expectedScope: scope,
        asOf: payload.asOf,
        maxEvidenceAgeDays: payload.maxEvidenceAgeDays,
      },
      preMoneyValuation: {
        ...observation,
        amountCents: payload.preMoneyCents,
      },
      raiseAmount: {
        ...observation,
        amountCents: payload.raiseAmountCents,
      },
    },
    termBurden: {
      instrument: payload.instrument,
      economicRightsKnown: payload.economicRightsKnown,
      controlRightsKnown: payload.controlRightsKnown,
      scope,
      classification: payload.classification,
      evidenceRefs: payload.evidenceRefs,
    },
    optionality: {
      before: payload.optionsBefore,
      after: payload.optionsAfter,
      scope,
      classification: payload.classification,
      evidenceRefs: payload.evidenceRefs,
    },
    evidence: {
      valueCreated: unknownEvidence(),
      humanOutcome: unknownEvidence(),
      externalDemand: unknownEvidence(),
      economics: unknownEvidence(),
      opportunityCost: unknownEvidence(),
      dependencies: unknownEvidence(),
      reversibility: unknownEvidence(),
      secondOrderEffects: unknownEvidence(),
      thirdOrderEffects: unknownEvidence(),
    },
    falsifier: unknownFalsifier(),
    stopCondition: {
      kind: 'dilution_ceiling',
      ceiling: {
        maxDilutionPct: payload.maxDilutionPct,
        classification: payload.classification,
        evidenceRefs: payload.evidenceRefs,
      },
    },
  };
}

export function installFounderCapitalDecisionRoute(router: Router): void {
  router.post('/capital-preview', (req, res) => {
    const payload = parseCapitalPreviewPayload(req.body as unknown);
    if (!payload) {
      return res.status(400).json({
        error: 'Capital preview input is malformed or contains unsupported fields.',
      });
    }

    const input = fundraisingInput(payload);
    const result = evaluateFundraisingAttack3000(input);
    const context: FounderCapitalDecisionContext = {
      milestoneUnlocked: payload.milestoneUnlocked,
      nextFinancingTrigger: payload.nextFinancingTrigger,
      expectedRunwayMonths: payload.expectedRunwayMonths,
    };
    const card = founderCapitalDecisionCardFromFundraising(context, input, result);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ card });
  });
}
