export const QUICKSCAN_CONTRACT = 'founder-control-room/quickscan@v1' as const;
export const QUICKSCAN_PRICE_CENTS = 24900;
export const QUICKSCAN_CURRENCY = 'usd';
export const QUICKSCAN_HIGH_PRIORITY_SCORE = 6;

export type QuickScanLifecycleState =
  | 'discovered' | 'researched' | 'qualified_for_outreach' | 'draft_ready'
  | 'approved_to_contact' | 'contacted' | 'replied' | 'fit_check_scheduled'
  | 'qualified' | 'disqualified' | 'payment_link_ready' | 'payment_link_sent'
  | 'paid' | 'diagnostic_scheduled' | 'diagnostic_complete' | 'delivery_due'
  | 'delivered' | 'closed_won' | 'closed_lost' | 'follow_up_later';

export type QuickScanSegment =
  | 'high_volume_solo_operator'
  | 'salon_studio_team_owner'
  | 'beauty_educator'
  | 'wig_custom_order_business'
  | 'high_ticket_beauty_wellness_operator';

export type QuickScanEvidenceCategory =
  | 'visible_friction'
  | 'active_demand'
  | 'owner_reachable'
  | 'repeat_high_value_service'
  | 'operational_complexity'
  | 'urgency';

export interface QuickScanEvidence {
  id: string;
  category: QuickScanEvidenceCategory;
  note: string;
  sourceUrl?: string;
  observedAt: string;
}

export interface QuickScanScore {
  visibleFriction: 0 | 2;
  activeDemand: 0 | 2;
  ownerReachable: 0 | 1;
  repeatHighValue: 0 | 2;
  operationalComplexity: 0 | 1;
  urgency: 0 | 2;
  total: number;
  evidenceIds: string[];
  humanApproved: boolean;
}

export interface PromptWorkflowReference {
  workflowId: string;
  workflowVersion: string;
  promptId: string;
  promptVersion: string;
  evaluationId?: string;
}

export interface ChiefQuickScanRecommendation {
  summary: string;
  nextAction: 'capture_more_evidence' | 'approve_outreach' | 'offer_fit_check' | 'send_payment_link' | 'prepare_delivery' | 'disqualify';
  messageDraft?: string;
  promptWorkflow: PromptWorkflowReference;
}

export interface QuickScanQualification {
  pain: string;
  frequency: string;
  economicImpact: string;
  authority: 'confirmed' | 'not_confirmed' | 'unknown';
  urgency: 'now' | 'later' | 'unknown';
  decision: 'qualified' | 'disqualified' | 'pending';
}

export interface QuickScanOverrideReceipt {
  id: string;
  actor: string;
  reason: string;
  from: QuickScanLifecycleState;
  to: QuickScanLifecycleState;
  evidenceIds: string[];
  createdAt: string;
}

export interface QuickScanApproval {
  id: string;
  action: 'outreach' | 'payment_link' | 'follow_up' | 'delivery';
  proposedAction: string;
  reason: string;
  evidenceIds: string[];
  recommendedBy: 'chief' | 'human';
  decision: 'PENDING' | 'APPROVE' | 'EDIT' | 'SKIP';
  decidedBy?: string;
  decidedAt?: string;
}

export interface QuickScanFlow {
  firstTrigger: string;
  loopAndHandoffs: string[];
  observableDropOffs: string[];
  winningFirstFix: string;
  metric: string;
}

export interface QuickScanProspect {
  id: string;
  businessName: string;
  ownerName?: string;
  segment: QuickScanSegment;
  lifecycleState: QuickScanLifecycleState;
  evidence: QuickScanEvidence[];
  score: QuickScanScore;
  qualification?: QuickScanQualification;
  chiefRecommendation?: ChiefQuickScanRecommendation;
  approvals: QuickScanApproval[];
  overrideReceipts: QuickScanOverrideReceipt[];
  payment: {
    status: 'unpaid' | 'link_ready' | 'link_sent' | 'paid' | 'refunded';
    amountCents: number;
    paymentLinkUrl?: string;
    /** Present only once a Stripe webhook event has verified this prospect paid. */
    verifiedBy?: 'stripe_webhook' | 'manual';
    verifiedAt?: string;
    stripeEventId?: string;
    stripeSessionId?: string;
    stripePaymentIntentId?: string;
  };
  flow?: QuickScanFlow;
  delivery?: { loomUrl?: string; deliveredAt?: string };
  audit: Array<{ id: string; type: string; message: string; actor: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}
