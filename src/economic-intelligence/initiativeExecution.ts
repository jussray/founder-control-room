import { operatorContinuityDimensionFingerprint } from '../lib/operatorContinuity.js';
import type {
  InitiativeEvidenceReceipt,
  InitiativeExecutionSnapshot,
  InitiativeGate,
} from './types.js';

const INITIATIVE_CONTRACT_VERSION = 'initiative-execution-v1';
const INITIATIVE_IDS = Object.freeze(['johnstown-ai-center'] as const);

const johnstownAiCenterReceipts: ReadonlyArray<InitiativeEvidenceReceipt> = Object.freeze([
  {
    id: 'plan:johnstown-ai-center:2026-09-09',
    classification: 'VERIFIED_DECISION',
    freshness: 'CURRENT',
    sourceKind: 'plan',
    observedAt: '2026-09-09',
    validThrough: '2026-12-08',
    sourceRef: 'private:plan/johnstown-ai-center/2026-09-09',
    sourceVersion: 'observed-2026-09-09',
    summary: 'Stage 1 is a 90-day proof-first pilot using partner or rented space; permanent real estate remains Phase 2 after utilization, revenue, partner support, and cash-flow proof.',
    authorityEffect: 'none',
  },
  {
    id: 'plan:johnstown-ai-center:success-gates:2026-09-09',
    classification: 'VERIFIED_DECISION',
    freshness: 'CURRENT',
    sourceKind: 'plan',
    observedAt: '2026-09-09',
    validThrough: '2026-12-08',
    sourceRef: 'private:plan/johnstown-ai-center/success-gates/2026-09-09',
    sourceVersion: 'observed-2026-09-09',
    summary: 'Pilot success targets include local-business participation, resident training, founder projects, earned or contracted revenue, repeat clients, and one proven partner-space model.',
    authorityEffect: 'none',
  },
  {
    id: 'city:document-review:2026-09-14',
    classification: 'VERIFIED_COMMITMENT',
    freshness: 'CURRENT',
    sourceKind: 'city_email',
    observedAt: '2026-09-14',
    validThrough: '2026-10-14',
    sourceRef: 'private:city-email/document-review/2026-09-14',
    sourceVersion: 'observed-2026-09-14',
    summary: 'City economic-development staff confirmed receipt of the final materials and committed to review them and follow up.',
    authorityEffect: 'none',
  },
  {
    id: 'city:site-control-guidance:2026-09-16',
    classification: 'VERIFIED_EVIDENCE',
    freshness: 'CURRENT',
    sourceKind: 'city_email',
    observedAt: '2026-09-16',
    validThrough: '2026-10-16',
    sourceRef: 'private:city-email/site-control-guidance/2026-09-16',
    sourceVersion: 'observed-2026-09-16',
    summary: 'City staff clarified that a signed lease or similar site-control documentation can be relevant, while a dedicated commercial property is preferred for the loan path and location benefit remains reviewable.',
    authorityEffect: 'none',
  },
  {
    id: 'city:jdl-guidelines:2025-08-18',
    classification: 'VERIFIED_EVIDENCE',
    freshness: 'CURRENT',
    sourceKind: 'program_guideline',
    observedAt: '2026-09-16',
    validThrough: '2026-10-16',
    sourceRef: 'public:city-jdl-guidelines/2025-08-18',
    sourceVersion: 'reobserved-2026-09-16',
    summary: 'Current City loan guidance requires a private non-residential project within City limits, project/job eligibility, evidence of site control, owner equity, documented financing commitments, and a complete underwriting package before committee review.',
    authorityEffect: 'none',
  },
  {
    id: 'city:jdl-application:2025-08-18',
    classification: 'VERIFIED_EVIDENCE',
    freshness: 'CURRENT',
    sourceKind: 'application',
    observedAt: '2026-09-16',
    validThrough: '2026-10-16',
    sourceRef: 'public:city-jdl-application/2025-08-18',
    sourceVersion: 'reobserved-2026-09-16',
    summary: 'The current application requires sources and uses, project financial projections, site control, financing commitments, owner financial documentation, and job-creation or retention information before a complete committee submission.',
    authorityEffect: 'none',
  },
  {
    id: 'partner:sbdc-review-path:2026-09-15',
    classification: 'VERIFIED_COMMITMENT',
    freshness: 'CURRENT',
    sourceKind: 'partner_email',
    observedAt: '2026-09-15',
    validThrough: '2026-10-15',
    sourceRef: 'private:partner-email/sbdc-review-path/2026-09-15',
    sourceVersion: 'observed-2026-09-15',
    summary: 'The regional SBDC acknowledged the Stage 1 materials and provided a client-registration path before scheduling business-plan review support.',
    authorityEffect: 'none',
  },
  {
    id: 'repo:city-hall-meeting-packet:2026-09-19',
    classification: 'VERIFIED_EVIDENCE',
    freshness: 'CURRENT',
    sourceKind: 'repository_doc',
    observedAt: '2026-09-19',
    validThrough: '2026-10-19',
    sourceRef: 'repo:docs/JOHNSTOWN_AI_CENTER_CITY_HALL_MEETING_PACKET.md',
    sourceVersion: 'candidate-observed-2026-09-19',
    summary: 'The repository now contains one compact City Hall working-meeting packet binding the pilot operator, participant groups, timeline, existing success metrics, evidence collection, space model, financing questions, explicit City asks, and stop conditions without implying City approval.',
    authorityEffect: 'none',
  },
]);

const johnstownAiCenterGates: ReadonlyArray<InitiativeGate> = Object.freeze([
  {
    id: 'city_hall_working_meeting',
    status: 'OPEN',
    summary: 'The City has acknowledged the materials and provided separate program guidance, but no dated working session is yet evidenced.',
    receiptIds: ['city:document-review:2026-09-14', 'city:site-control-guidance:2026-09-16'],
    proofToClear: 'A dated invitation, calendar event, or City reply confirming meeting date/time, participants, and working purpose or agenda.',
    blockers: [
      'No dated City Hall working meeting receipt is present.',
    ],
  },
  {
    id: 'city_sponsor_owner',
    status: 'UNKNOWN',
    summary: 'Responsive City staff are verified, but no person or office has explicitly accepted ownership for advancing the initiative through a defined City process.',
    receiptIds: ['city:document-review:2026-09-14', 'city:site-control-guidance:2026-09-16'],
    proofToClear: 'A named City person or office explicitly accepts responsibility for a defined next action or decision path.',
    blockers: [
      'A reply or review promise is not sponsorship or process ownership.',
    ],
  },
  {
    id: 'meeting_ready_pilot',
    status: 'VERIFIED',
    summary: 'A compact meeting packet now binds the 90-day pilot operator, participant groups, measurable success targets, evidence collection, partner-space strategy, financing questions, explicit City asks, and stop conditions.',
    receiptIds: [
      'plan:johnstown-ai-center:2026-09-09',
      'plan:johnstown-ai-center:success-gates:2026-09-09',
      'repo:city-hall-meeting-packet:2026-09-19',
    ],
    proofToClear: 'Satisfied by docs/JOHNSTOWN_AI_CENTER_CITY_HALL_MEETING_PACKET.md on the current exact candidate head.',
    blockers: [],
  },
  {
    id: 'funding_facility_path',
    status: 'BLOCKED',
    summary: 'The planning request is not yet proven compatible with the City loan structure as a complete financing package.',
    receiptIds: [
      'city:site-control-guidance:2026-09-16',
      'city:jdl-guidelines:2025-08-18',
      'city:jdl-application:2025-08-18',
    ],
    proofToClear: 'Current City confirmation of the applicable loan component and financing mix, eligible site-control form, job-creation treatment, owner-equity requirement, outside financing commitments, and current facility/equipment/insurance/admin quotes.',
    blockers: [
      'Site control for an eligible non-residential City location is not yet documented.',
      'The required job-creation treatment for the proposed loan amount is not yet reconciled to the Stage 1 staffing plan.',
      'The planning request has not yet been reconciled to the applicable City financing-share cap and resulting total project cost.',
      'Owner equity and the remaining private or other financing commitments are not yet evidenced as a complete financing package.',
      'Current major facility, equipment, insurance, and setup quotes remain incomplete.',
      'Loan-program fit is not loan approval and must not be represented as such.',
    ],
  },
]);

function asIsoDate(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error('INITIATIVE_OBSERVATION_TIME_INVALID');
  return value.toISOString().slice(0, 10);
}

function materializeReceipts(asOf: Date): InitiativeEvidenceReceipt[] {
  const observationDate = asIsoDate(asOf);
  return johnstownAiCenterReceipts.map((receipt) => ({
    ...receipt,
    freshness: receipt.freshness === 'CURRENT' && observationDate > receipt.validThrough
      ? 'STALE'
      : receipt.freshness,
  }));
}

function materializeGates(
  receipts: ReadonlyArray<InitiativeEvidenceReceipt>,
): InitiativeGate[] {
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  return johnstownAiCenterGates.map((gate) => {
    const nonCurrentReceiptIds = gate.receiptIds.filter((receiptId) => {
      const receipt = receiptById.get(receiptId);
      return !receipt || receipt.freshness !== 'CURRENT';
    });
    const status = nonCurrentReceiptIds.length > 0 && (gate.status === 'VERIFIED' || gate.status === 'PARTIAL')
      ? 'UNKNOWN'
      : gate.status;
    const blockers = nonCurrentReceiptIds.length > 0
      ? [
          ...gate.blockers,
          `Evidence requires revalidation before this gate can be treated as current: ${nonCurrentReceiptIds.join(', ')}.`,
        ]
      : [...gate.blockers];

    return {
      ...gate,
      status,
      receiptIds: [...gate.receiptIds],
      blockers,
    };
  });
}

function fingerprintState(receipts: ReadonlyArray<InitiativeEvidenceReceipt>, gates: ReadonlyArray<InitiativeGate>): string {
  const fingerprint = operatorContinuityDimensionFingerprint({
    contractVersion: INITIATIVE_CONTRACT_VERSION,
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      classification: receipt.classification,
      freshness: receipt.freshness,
      sourceKind: receipt.sourceKind,
      observedAt: receipt.observedAt,
      validThrough: receipt.validThrough,
      sourceRef: receipt.sourceRef,
      sourceVersion: receipt.sourceVersion,
      summary: receipt.summary,
      authorityEffect: receipt.authorityEffect,
    })),
    gates: gates.map((gate) => ({
      id: gate.id,
      status: gate.status,
      summary: gate.summary,
      receiptIds: [...gate.receiptIds],
      proofToClear: gate.proofToClear,
      blockers: [...gate.blockers],
    })),
  });

  return `initiative-state-v1:sha256:${fingerprint}`;
}

function buildJohnstownAiCenterSnapshot(asOf: Date): InitiativeExecutionSnapshot {
  const receipts = materializeReceipts(asOf);
  const gates = materializeGates(receipts);

  return {
    contractVersion: INITIATIVE_CONTRACT_VERSION,
    initiativeId: 'johnstown-ai-center',
    initiativeName: 'Johnstown AI Center',
    jurisdictionId: 'jurisdiction:us-pa-johnstown',
    goal: 'Turn the City Hall plan into a concrete 90-day proof-first pilot with a named City decision path, measurable outcomes, and a financeable partner-space model before any permanent-facility commitment.',
    evidenceObservedThrough: receipts.reduce(
      (latest, receipt) => receipt.observedAt > latest ? receipt.observedAt : latest,
      '',
    ),
    receipts,
    gates,
    nextGateId: 'city_hall_working_meeting',
    continuityFingerprint: fingerprintState(receipts, gates),
    authority: {
      kind: 'descriptive_only',
      canAuthorize: false,
      note: 'Evidence receipts, fingerprints, and proof cookies describe continuity only. They never grant City, founder, lender, provider, merge, deployment, spending, or communication authority.',
    },
  };
}

export function listInitiativeIds(): string[] {
  return [...INITIATIVE_IDS];
}

export function buildInitiativeExecutionSnapshot(
  initiativeId: string,
  asOf: Date = new Date(),
): InitiativeExecutionSnapshot | null {
  switch (initiativeId) {
    case 'johnstown-ai-center':
      return buildJohnstownAiCenterSnapshot(asOf);
    default:
      return null;
  }
}
