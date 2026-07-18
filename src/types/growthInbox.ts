export type GrowthChannel =
  | 'webchat'
  | 'email'
  | 'instagram_direct'
  | 'facebook_messenger'
  | 'whatsapp'
  | 'telegram'
  | 'sms_mms'
  | 'voice_calls'
  | 'viber'
  | 'google_business_messages';

export type AutomationMode =
  | 'observe_only'
  | 'draft_only'
  | 'inbound_assist'
  | 'approved_sequence'
  | 'trusted_rules';

export type CommunicationPurpose =
  | 'transactional'
  | 'support'
  | 'updates'
  | 'marketing'
  | 'calls';

export type PolicyDecisionState =
  | 'allow'
  | 'deny'
  | 'unknown'
  | 'conflict'
  | 'expired'
  | 'missing_evidence';

export type LeadStage =
  | 'new'
  | 'engaged'
  | 'qualified'
  | 'nurture'
  | 'high_intent'
  | 'booked'
  | 'won'
  | 'lost'
  | 'do_not_contact';

export type RevenueState =
  | 'attention'
  | 'permission'
  | 'conversation'
  | 'qualified'
  | 'booked'
  | 'invoiced'
  | 'pledged'
  | 'payment_collected'
  | 'refunded'
  | 'charged_back'
  | 'retained'
  | 'referred';

export interface ConsentEvidence {
  projectId: string;
  brandId: string;
  channel: GrowthChannel;
  purpose: CommunicationPurpose;
  senderIdentity: string;
  recipientIdentity: string;
  status: 'unknown' | 'opted_in' | 'opted_out' | 'blocked' | 'expired';
  source: string;
  consentCopyVersion: string;
  evidenceReference: string;
  consentedAt?: string;
  revokedAt?: string;
  jurisdictionContext?: string;
  retentionState: 'active' | 'scheduled_for_deletion' | 'deleted';
}

export interface CanonicalMessageEnvelope {
  providerEventId: string;
  idempotencyKey: string;
  projectId: string;
  brandId: string;
  channel: GrowthChannel;
  providerAccountId: string;
  providerConversationId: string;
  providerUserId: string;
  direction: 'inbound' | 'outbound';
  contentType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'event' | 'unknown';
  sanitizedText?: string;
  contentReference?: string;
  receivedAt: string;
  providerTimestamp?: string;
  signatureVerified: boolean;
  automationMode: AutomationMode;
  purpose?: CommunicationPurpose;
  sensitivityFlags: string[];
}

export interface ChannelCapabilities {
  channel: GrowthChannel;
  inboundSupported: boolean;
  outboundSupported: boolean | 'provider_limited' | 'template_and_window_limited' | 'consent_and_sender_limited' | 'user_relationship_required';
  currentPolicyVersion: string;
  currentPolicyReviewedAt: string;
  supportsTemplates: boolean;
  supportsConversationWindows: boolean;
  supportsOptOutEvents: boolean;
  supportsDeliveryEvidence: boolean;
  supportsRecording: boolean;
  supportsTranscription: boolean;
  supportsSyntheticVoice: boolean;
}

export interface DispatchContext {
  projectId: string;
  brandId: string;
  channel: GrowthChannel;
  senderIdentity: string;
  recipientIdentity: string;
  purpose: CommunicationPurpose;
  automationMode: AutomationMode;
  templateId?: string;
  templateVersion?: string;
  audienceSource?: string;
  jurisdiction?: string;
  recipientTimeZone?: string;
  scheduledAt?: string;
  budgetCapCents?: number;
  frequencyCap?: number;
  campaignId?: string;
  founderApprovalId?: string;
}

export interface DispatchCheck {
  name:
    | 'project_brand'
    | 'sender_identity'
    | 'recipient_identity'
    | 'purpose'
    | 'consent'
    | 'suppression'
    | 'conversation_window_or_template'
    | 'jurisdiction'
    | 'quiet_hours'
    | 'registration'
    | 'content_approval'
    | 'claim_evidence'
    | 'frequency_budget_kill_switch'
    | 'audit_and_idempotency';
  state: PolicyDecisionState;
  evidenceReferences: string[];
  reason?: string;
}

export interface DispatchDecision {
  decision: 'allow' | 'deny';
  checks: DispatchCheck[];
  decidedAt: string;
  policyVersion: string;
  denialReasons: string[];
}

export interface DispatchRequest {
  envelope: CanonicalMessageEnvelope;
  context: DispatchContext;
  decision: DispatchDecision;
  approvedContent: {
    text?: string;
    contentReference?: string;
    templateId?: string;
    templateVersion?: string;
  };
}

export interface DispatchResult {
  accepted: boolean;
  providerMessageId?: string;
  status: 'accepted' | 'delivered' | 'failed' | 'blocked' | 'suppressed';
  evidenceReference: string;
  failureCode?: string;
  failureReason?: string;
}

export interface LeadRecord {
  projectId: string;
  contactId?: string;
  stage: LeadStage;
  expressedNeed?: string;
  productOrOffer?: string;
  sourceCampaign?: string;
  qualificationEvidence: string[];
  nextAction?: string;
  owner?: string;
  projectedValueCents?: number;
  actualCollectedValueCents?: number;
  revenueState: RevenueState;
  lastStageChangeAt: string;
}

export interface GrowthChannelAdapter {
  readonly id: GrowthChannel;

  getCapabilities(): Promise<ChannelCapabilities>;

  verifyInbound(input: {
    headers: Record<string, string | undefined>;
    rawBody: Uint8Array;
  }): Promise<{ verified: boolean; evidenceReference: string }>;

  normalizeInbound(input: {
    headers: Record<string, string | undefined>;
    rawBody: Uint8Array;
  }): Promise<CanonicalMessageEnvelope[]>;

  evaluateDispatch(context: DispatchContext): Promise<DispatchDecision>;

  dispatch(request: DispatchRequest): Promise<DispatchResult>;

  disable(reason: string): Promise<{ disabled: true; evidenceReference: string }>;
}

export function isDispatchAllowed(decision: DispatchDecision): boolean {
  if (decision.decision !== 'allow') return false;

  return decision.checks.every((check) => check.state === 'allow');
}

export function isCollectedRevenue(record: LeadRecord): boolean {
  return record.revenueState === 'payment_collected' &&
    typeof record.actualCollectedValueCents === 'number' &&
    record.actualCollectedValueCents >= 0;
}
