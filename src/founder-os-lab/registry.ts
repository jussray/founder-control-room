import type {
  FounderOsLabAction,
  FounderOsLabAdapterId,
  FounderOsLabCapabilityId,
  FounderOsLabSkillId,
} from './contracts.js';

export interface FounderOsLabSkillDescriptor {
  id: FounderOsLabSkillId;
  role: string;
  mayExecute: false;
}

export interface FounderOsLabCapabilityDescriptor {
  id: FounderOsLabCapabilityId;
  role: string;
  sideEffectClass: 'none';
}

export interface FounderOsLabActionRoute {
  specialistSkill: FounderOsLabSkillId;
  capabilities: FounderOsLabCapabilityId[];
  adapters: FounderOsLabAdapterId[];
  approvalRequired: boolean;
}

export const FOUNDER_OS_LAB_SKILLS: readonly FounderOsLabSkillDescriptor[] = [
  {
    id: 'juss-chief-ai',
    role: 'Chief routing and founder-intent translation.',
    mayExecute: false,
  },
  {
    id: 'goalfix',
    role: 'Focused diagnosis and smallest-safe-fix planning.',
    mayExecute: false,
  },
  {
    id: 'repo-truth',
    role: 'Repository, branch, exact-head, and evidence reconciliation.',
    mayExecute: false,
  },
  {
    id: 'proof-led-publishing',
    role: 'Proof-gated content planning and social draft validation.',
    mayExecute: false,
  },
  {
    id: 'review-verify-merge',
    role: 'Merge-readiness planning bound to exact-head evidence.',
    mayExecute: false,
  },
] as const;

export const FOUNDER_OS_LAB_CAPABILITIES: readonly FounderOsLabCapabilityDescriptor[] = [
  { id: 'founder-routing', role: 'Convert a founder goal into one bounded workstream.', sideEffectClass: 'none' },
  { id: 'repository-inspection', role: 'Plan repository evidence reads without performing them.', sideEffectClass: 'none' },
  { id: 'proof-validation', role: 'Validate supplied evidence shape and truth boundaries.', sideEffectClass: 'none' },
  { id: 'social-draft-validation', role: 'Run the existing pure social-post validator.', sideEffectClass: 'none' },
  { id: 'buffer-handoff-preview', role: 'Describe a Buffer handoff without invoking Buffer or Zapier.', sideEffectClass: 'none' },
  { id: 'merge-readiness-preview', role: 'Describe merge gates without mutating GitHub.', sideEffectClass: 'none' },
  { id: 'deployment-readiness-preview', role: 'Describe deployment gates without provider calls.', sideEffectClass: 'none' },
  { id: 'outreach-readiness-preview', role: 'Describe outreach gates without sending email or mutating CRM.', sideEffectClass: 'none' },
] as const;

export const FOUNDER_OS_LAB_ACTION_ROUTES: Readonly<Record<FounderOsLabAction, FounderOsLabActionRoute>> = {
  inspect: {
    specialistSkill: 'repo-truth',
    capabilities: ['founder-routing', 'repository-inspection', 'proof-validation'],
    adapters: ['repository-preview'],
    approvalRequired: false,
  },
  plan: {
    specialistSkill: 'goalfix',
    capabilities: ['founder-routing', 'proof-validation'],
    adapters: [],
    approvalRequired: false,
  },
  'draft-social': {
    specialistSkill: 'proof-led-publishing',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: false,
  },
  'queue-social': {
    specialistSkill: 'proof-led-publishing',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: true,
  },
  'publish-social': {
    specialistSkill: 'proof-led-publishing',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: true,
  },
  'merge-code': {
    specialistSkill: 'review-verify-merge',
    capabilities: ['founder-routing', 'repository-inspection', 'proof-validation', 'merge-readiness-preview'],
    adapters: ['repository-preview', 'merge-preview'],
    approvalRequired: true,
  },
  'deploy-code': {
    specialistSkill: 'goalfix',
    capabilities: ['founder-routing', 'proof-validation', 'deployment-readiness-preview'],
    adapters: ['deployment-preview'],
    approvalRequired: true,
  },
  'send-email': {
    specialistSkill: 'proof-led-publishing',
    capabilities: ['founder-routing', 'proof-validation', 'outreach-readiness-preview'],
    adapters: ['email-preview'],
    approvalRequired: true,
  },
};
