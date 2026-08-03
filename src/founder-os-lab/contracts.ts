import type { FirstPartySocialPostInput } from '../lib/firstPartySocialPublisher.js';

export const FOUNDER_OS_LAB_VERSION = 'founder-os-lab-v1' as const;

export type FounderOsLabAction =
  | 'inspect'
  | 'plan'
  | 'draft-social'
  | 'queue-social'
  | 'publish-social'
  | 'merge-code'
  | 'deploy-code'
  | 'send-email';

export type FounderOsLabSkillId =
  | 'juss-chief-ai'
  | 'goalfix'
  | 'repo-truth'
  | 'proof-led-publishing'
  | 'review-verify-merge';

export type FounderOsLabCommandId =
  | 'goalfix'
  | 'ultrathink'
  | 'truthmode'
  | 'confess'
  | 'redteam'
  | 'lindymode'
  | 'ooda'
  | 'visualize'
  | 'build'
  | 'billgates'
  | 'elonmusk'
  | 'loop';

export type FounderOsLabProviderId =
  | 'chatgpt'
  | 'claude'
  | 'codex'
  | 'perplexity'
  | 'github'
  | 'supabase'
  | 'cloudflare'
  | 'zapier'
  | 'figma'
  | 'openai-platform'
  | 'hubspot';

export type FounderOsLabCapabilityId =
  | 'founder-routing'
  | 'repository-inspection'
  | 'proof-validation'
  | 'social-draft-validation'
  | 'buffer-handoff-preview'
  | 'merge-readiness-preview'
  | 'deployment-readiness-preview'
  | 'outreach-readiness-preview';

export type FounderOsLabAdapterId =
  | 'repository-preview'
  | 'first-party-social-validator'
  | 'buffer-preview'
  | 'merge-preview'
  | 'deployment-preview'
  | 'email-preview';

export type FounderOsLabReadiness =
  | 'ready_for_review'
  | 'approval_required'
  | 'ready_for_external_executor'
  | 'blocked';

export type FounderOsLabEvidenceField =
  | 'repository'
  | 'commitSha'
  | 'proofUrls';

export interface FounderOsLabApproval {
  id: string;
  actions: FounderOsLabAction[];
}

export interface FounderOsLabEvidence {
  repository?: string;
  commitSha?: string;
  proofUrls?: string[];
}

export interface FounderOsLabRequest {
  goal: string;
  action: FounderOsLabAction;
  command?: FounderOsLabCommandId;
  provider?: FounderOsLabProviderId;
  approval?: FounderOsLabApproval;
  evidence?: FounderOsLabEvidence;
  socialPost?: FirstPartySocialPostInput;
}

export interface FounderOsLabProviderRoute {
  id: FounderOsLabProviderId;
  mode: 'preview';
  supported: boolean;
  executionAllowed: false;
  approvalRequired: boolean;
  credentialBoundary: 'connector-owned' | 'server-side-secret-reference';
  evidenceRequired: string[];
  preflightEvidenceRequired: FounderOsLabEvidenceField[];
  preflightEvidenceObserved: FounderOsLabEvidenceField[];
  preflightEvidenceMissing: FounderOsLabEvidenceField[];
  rollback: string;
}

export interface FounderOsLabCommandRoute {
  id: FounderOsLabCommandId;
  specialistSkill: FounderOsLabSkillId;
  role: string;
}

export interface FounderOsLabRoute {
  chiefSkill: 'juss-chief-ai';
  specialistSkill: FounderOsLabSkillId;
  command: FounderOsLabCommandRoute;
  provider: FounderOsLabProviderRoute;
  capabilities: FounderOsLabCapabilityId[];
  adapters: FounderOsLabAdapterId[];
}

export interface FounderOsLabPlan {
  version: typeof FOUNDER_OS_LAB_VERSION;
  goal: string;
  action: FounderOsLabAction;
  readiness: FounderOsLabReadiness;
  isolation: {
    externalCalls: false;
    providerCalls: false;
    databaseWrites: false;
    filesystemWrites: false;
    environmentReads: false;
  };
  authority: {
    level: 'L0';
    mode: 'simulation';
    executionAllowed: false;
    approvalRequired: boolean;
    approvalObserved: boolean;
  };
  route: FounderOsLabRoute;
  truth: {
    verified: string[];
    inferred: string[];
    unknown: string[];
    blocked: string[];
  };
  redteam: {
    shouldExist: boolean;
    premiseRisk: string;
    failureModes: string[];
  };
  l99: {
    authority: string;
    state: string;
    evidence: string;
    rollback: string;
    compoundingValue: string;
  };
  ooda: {
    observe: string[];
    orient: string[];
    decide: string[];
    act: string[];
    verify: string[];
    loop: string[];
  };
  nextGate: string;
}
