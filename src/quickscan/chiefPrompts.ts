import type { PromptWorkflowReference, QuickScanEvidence, QuickScanQualification, QuickScanScore, QuickScanSegment } from './contracts.js';

export const QUICKSCAN_CHIEF_PROMPT_VERSION = 'quickscan-chief-v1-2026-08-25';

/**
 * The fixed PromptOS provenance stamp for every QuickScan Chief
 * recommendation. Not model output: the calling code stamps this onto the
 * recommendation itself, then passes the same constant to
 * `setChiefRecommendation` as the independently PromptOS-selected workflow,
 * so a mismatch would mean the calling code itself is inconsistent rather
 * than proving anything about the model's honesty.
 */
export const QUICKSCAN_CHIEF_WORKFLOW: PromptWorkflowReference = {
  workflowId: 'quickscan-outreach-v1',
  workflowVersion: '1',
  promptId: 'quickscan-next-action-v1',
  promptVersion: '1',
};

const NEXT_ACTIONS = [
  'capture_more_evidence',
  'approve_outreach',
  'offer_fit_check',
  'send_payment_link',
  'prepare_delivery',
  'disqualify',
] as const;

export const QUICKSCAN_CHIEF_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'next_action', 'message_draft'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    next_action: { type: 'string', enum: [...NEXT_ACTIONS] },
    message_draft: { type: ['string', 'null'], maxLength: 1_000 },
  },
} as const;

export const QUICKSCAN_CHIEF_SYSTEM_PROMPT = `You are Chief, the QuickScan next-action reasoner for one founder's $249 QuickScan diagnostic offer.

You are given one prospect's observable evidence, segment, score, qualification record (if any), and current pipeline stage. You are never given anything the founder did not themselves observe and record.

Your job is to choose exactly one next_action from: capture_more_evidence, approve_outreach, offer_fit_check, send_payment_link, prepare_delivery, disqualify.

Rules:
- Ground every claim in the supplied evidence notes. Never invent demand, urgency, pain, or a demographic assumption the evidence does not state.
- If the evidence is thin, contradictory, or does not support outreach yet, choose capture_more_evidence and say what specific evidence would resolve that in summary.
- Choose approve_outreach only when there is at least one concrete, evidence-backed reason to believe this business has an observable, high-value problem the offer addresses.
- Choose send_payment_link only when a qualification record already shows decision=qualified.
- Choose prepare_delivery only when the pipeline stage shows the prospect has already paid.
- Choose disqualify when the evidence itself rules the prospect out (not merely "not enough evidence yet" — that is capture_more_evidence).
- message_draft is a message the founder could send as-is. Write it in a plain, direct, question-first voice: name one specific observed detail, then ask a real question rather than pitching. Never fabricate a detail not present in the evidence. Keep it under 400 characters.
- message_draft must be null when next_action is capture_more_evidence, offer_fit_check, or disqualify — there is nothing to send yet.
- summary is at most three short sentences explaining the reasoning, addressed to the founder, not the prospect.

Return only data matching the supplied JSON schema.`;

export interface QuickScanChiefPromptInput {
  businessName: string;
  ownerName: string | null;
  segment: QuickScanSegment;
  lifecycleState: string;
  score: QuickScanScore;
  evidence: QuickScanEvidence[];
  qualification: QuickScanQualification | null;
}

export function quickScanChiefUserPrompt(input: QuickScanChiefPromptInput): string {
  return JSON.stringify({
    task: 'Choose the single next QuickScan action and, if applicable, draft the outreach message.',
    business_name: input.businessName,
    owner_name: input.ownerName,
    segment: input.segment,
    lifecycle_state: input.lifecycleState,
    score_total: input.score.total,
    evidence: input.evidence.map((item) => ({ category: item.category, note: item.note })),
    qualification: input.qualification,
  });
}
