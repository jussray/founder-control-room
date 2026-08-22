import type { FirstPartySocialPostInput } from '../lib/firstPartySocialPublisher.js';
import type { UntrustedArtifact } from '../security/untrustedArtifactBoundary.js';
import type { V10CapabilityPlan } from './capabilityKernel.js';

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
  | 'truth-decay-audit'
  | 'proof-led-publishing'
  | 'review-verify-merge';

export type FounderOsLabCommandId =
  | 'human'
  | 'futureyou'
  | 'v10'
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
  | 'firstprinciples'
  | 'socrates'
  | 'ycombinator'
  | 'antiadvice'
  | 'hormozi'
  | 'unlearn'
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

export type FounderOsLabProjectAdapterId = 'sekret-bip' | 'chief-ai-machine';
export type FounderOsLabProjectAudience = 'teen' | 'bip-jr';

export type FounderOsLabCapabilityId =
  | 'founder-routing'
  | 'repository-inspection'
  | 'proof-validation'
  | 'capability-plan-validation'
  | 'capability-provenance-validation'
  | 'authority-boundary-validation'
  | 'decision-card-preview'
  | 'outcome-observation-preview'
  | 'social-draft-validation'
  | 'buffer-handoff-preview'
  | 'merge-readiness-preview'
  | 'deployment-readiness-preview'
  | 'outreach-readiness-preview'
  | 'project-contract-validation'
  | 'project-canon-validation'
  | 'editable-design-preview';

export type FounderOsLabAdapterId =
  | 'repository-preview'
  | 'first-party-social-validator'
  | 'buffer-preview'
  | 'merge-preview'
  | 'deployment-preview'
  | 'email-preview'
  | 'sekret-bip-project-preview'
  | 'chief-ai-machine-project-preview';

export type FounderOsLabReadiness =
  | 'ready_for_review'
  | 'approval_required'
  | 'ready_for_external_executor'
  | 'blocked';

export type FounderOsLabEvidenceField =
  | 'repository'
  | 'commitSha'
  | 'proofUrls'
  | 'projectId'
  | 'providerAccountId'
  | 'automationId'
  | 'workspaceId'
  | 'recordIds'
  | 'associationPlan';

export interface FounderOsLabApproval {
  id: string;
  actions: FounderOsLabAction[];
  projectSlug?: string;
  expectedHeadSha?: string;
  capabilityPlanHash?: string;
}

export interface FounderOsLabEvidence {
  repository?: string;
  commitSha?: string;
  proofUrls?: string[];
  projectId?: string;
  providerAccountId?: string;
  automationId?: string;
  workspaceId?: string;
  recordIds?: string[];
  associationPlan?: string;
}

export interface FounderOsLabProjectContext {
  id: FounderOsLabProjectAdapterId;
  sourceRepository: string;
  sourceCommitSha: string;
  contractUrls: string[];
  audience?: FounderOsLabProjectAudience;
}

export interface FounderOsLabRequest {
  goal: string;
  action: FounderOsLabAction;
  command?: FounderOsLabCommandId;
  provider?: FounderOsLabProviderId;
  approval?: FounderOsLabApproval;
  evidence?: FounderOsLabEvidence;
  project?: FounderOsLabProjectContext;
  capabilityPlan?: V10CapabilityPlan;
  socialPost?: FirstPartySocialPostInput;
  untrustedArtifacts?: UntrustedArtifact[];
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

export interface FounderOsLabProjectRoute {
  id: FounderOsLabProjectAdapterId;
  name: string;
  mode: 'preview';
  supported: boolean;
  executionAllowed: false;
  authorityOwner: 'founder-control-room';
  repository: string;
  sourceCommitSha: string;
  auditedSourceHead: string;
  audience: FounderOsLabProjectAudience | null;
  allowedActions: FounderOsLabAction[];
  allowedProviders: FounderOsLabProviderId[];
  contractPathsRequired: string[];
  contractPathsObserved: string[];
  contractPathsMissing: string[];
  rules: string[];
  canonicalDisplayNames: string[];
  forbiddenDisplayNames: string[];
  legacyInternalIdsPreserved: boolean;
  editableOutputRequired: boolean;
  sourceTraceRequired: boolean;
  factualAiIdentityRequired: boolean;
  rollback: string;
}

export interface FounderOsLabCommandRoute {
  id: FounderOsLabCommandId;
  role: string;
  class: 'founder' | 'strategic' | 'truth' | 'execution' | 'creative';
}

export interface FounderOsLabCapabilityPlanRoute {
  observed: boolean;
  valid: boolean;
  selectedBy: 'chief-ai-machine' | null;
  planHash: string | null;
  registryHash: string | null;
  capabilityIds: string[];
  strategicLenses: string[];
  outcomeSignals: string[];
  errors: string[];
}

export interface FounderOsLabRoute {
  chiefSkill: 'juss-chief-ai';
  command: FounderOsLabCommandRoute;
  provider: FounderOsLabProviderRoute;
  project: FounderOsLabProjectRoute | null;
  capabilityPlan: FounderOsLabCapabilityPlanRoute;
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
    capabilityPlanBound: boolean;
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
