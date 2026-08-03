import type {
  FounderOsLabAction,
  FounderOsLabAdapterId,
  FounderOsLabCapabilityId,
  FounderOsLabCommandId,
  FounderOsLabProviderId,
  FounderOsLabSkillId,
} from './contracts.js';

export interface FounderOsLabSkillDescriptor {
  id: FounderOsLabSkillId;
  role: string;
  mayExecute: false;
}

export interface FounderOsLabCommandDescriptor {
  id: FounderOsLabCommandId;
  specialistSkill: FounderOsLabSkillId;
  role: string;
  mayExecute: false;
}

export interface FounderOsLabCapabilityDescriptor {
  id: FounderOsLabCapabilityId;
  role: string;
  sideEffectClass: 'none';
}

export interface FounderOsLabProviderDescriptor {
  id: FounderOsLabProviderId;
  role: string;
  mode: 'preview';
  sideEffectClass: 'none';
  credentialBoundary: 'connector-owned' | 'server-side-secret-reference';
  supportedActions: readonly FounderOsLabAction[];
  evidenceRequired: readonly string[];
  rollback: string;
}

export interface FounderOsLabActionRoute {
  specialistSkill: FounderOsLabSkillId;
  defaultCommand: FounderOsLabCommandId;
  defaultProvider: FounderOsLabProviderId;
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

export const FOUNDER_OS_LAB_COMMANDS: readonly FounderOsLabCommandDescriptor[] = [
  {
    id: 'goalfix',
    specialistSkill: 'goalfix',
    role: 'Diagnose one failure and identify the smallest reversible evidence-backed fix.',
    mayExecute: false,
  },
  {
    id: 'ultrathink',
    specialistSkill: 'juss-chief-ai',
    role: 'Expand the option space, reconcile constraints, and surface the highest-leverage path.',
    mayExecute: false,
  },
  {
    id: 'truthmode',
    specialistSkill: 'repo-truth',
    role: 'Separate VERIFIED, INFERRED, UNKNOWN, and BLOCKED claims against supplied evidence.',
    mayExecute: false,
  },
  {
    id: 'confess',
    specialistSkill: 'repo-truth',
    role: 'Expose unsupported assumptions, missing inspection, stale evidence, and overclaimed certainty.',
    mayExecute: false,
  },
  {
    id: 'redteam',
    specialistSkill: 'juss-chief-ai',
    role: 'Challenge whether the proposed change should exist and how the selected fix could fail.',
    mayExecute: false,
  },
  {
    id: 'lindymode',
    specialistSkill: 'juss-chief-ai',
    role: 'Prefer durable, reversible, low-dependency primitives over novelty and brittle coupling.',
    mayExecute: false,
  },
  {
    id: 'ooda',
    specialistSkill: 'juss-chief-ai',
    role: 'Observe, orient, decide, act in preview, verify, and define the next loop.',
    mayExecute: false,
  },
  {
    id: 'visualize',
    specialistSkill: 'juss-chief-ai',
    role: 'Translate a verified product or system state into an editable visual plan without rendering or provider calls.',
    mayExecute: false,
  },
  {
    id: 'build',
    specialistSkill: 'goalfix',
    role: 'Shape one implementation-ready slice with proof, rollback, and explicit authority boundaries.',
    mayExecute: false,
  },
  {
    id: 'billgates',
    specialistSkill: 'juss-chief-ai',
    role: 'Apply a systems, leverage, platform, and compounding-value product lens.',
    mayExecute: false,
  },
  {
    id: 'elonmusk',
    specialistSkill: 'juss-chief-ai',
    role: 'Apply a first-principles and product-simplification lens only; never simulate a person or transfer identity authority.',
    mayExecute: false,
  },
  {
    id: 'loop',
    specialistSkill: 'review-verify-merge',
    role: 'Repeat audit, focused repair, exact-head verification, review, and next-gate selection without carrying approval forward.',
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

export const FOUNDER_OS_LAB_PROVIDERS: readonly FounderOsLabProviderDescriptor[] = [
  {
    id: 'chatgpt',
    role: 'Conversation, synthesis, drafting, and planning preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'draft-social'],
    evidenceRequired: ['model identity', 'request scope', 'sanitized output receipt'],
    rollback: 'Discard the preview response; no external state exists.',
  },
  {
    id: 'claude',
    role: 'Long-context analysis, drafting, and implementation-plan preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'draft-social'],
    evidenceRequired: ['model identity', 'request scope', 'sanitized output receipt'],
    rollback: 'Discard the preview response; no external state exists.',
  },
  {
    id: 'codex',
    role: 'Repository inspection, implementation, merge, and deployment-readiness preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'merge-code', 'deploy-code'],
    evidenceRequired: ['repository', 'branch', 'exact commit SHA', 'named verification plan'],
    rollback: 'Discard the preview; no branch, commit, merge, or deployment is created.',
  },
  {
    id: 'perplexity',
    role: 'Read-only external research and source-receipt preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan'],
    evidenceRequired: ['research scope', 'source receipts', 'freshness timestamp', 'output hash'],
    rollback: 'Discard the research preview and retain no provider state.',
  },
  {
    id: 'github',
    role: 'Repository, branch, pull request, exact-head, checks, and review preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'merge-code'],
    evidenceRequired: ['repository', 'base branch', 'candidate head SHA', 'checks', 'review threads'],
    rollback: 'Discard the preview; no repository reference is changed.',
  },
  {
    id: 'supabase',
    role: 'Project, migration, advisor, authorization, and database-readiness preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'deploy-code'],
    evidenceRequired: ['project identifier', 'migration ledger', 'advisor receipt', 'role boundary'],
    rollback: 'Discard the preview; no query, migration, policy, or data mutation occurs.',
  },
  {
    id: 'cloudflare',
    role: 'Cloudflare compute, Pages, build, deployment, DNS, and runtime-readiness preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'deploy-code'],
    evidenceRequired: ['project name', 'source SHA', 'build or deployment receipt', 'runtime read-back plan'],
    rollback: 'Discard the preview; no Cloudflare compute, Pages, DNS, route, or secret state changes.',
  },
  {
    id: 'zapier',
    role: 'Automation topology, task budget, review window, and run-receipt preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'queue-social', 'publish-social', 'send-email'],
    evidenceRequired: ['Zap identity', 'trigger/action schema', 'task budget', 'run receipt plan'],
    rollback: 'Discard the preview; no Zap, task, schedule, email, or publication action runs.',
  },
  {
    id: 'figma',
    role: 'Editable design artifact, component, and handoff preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan'],
    evidenceRequired: ['file or project identity', 'editable-layer requirement', 'source-requirement trace'],
    rollback: 'Discard the preview; no design file or component is created or changed.',
  },
  {
    id: 'openai-platform',
    role: 'OpenAI API project, key-boundary, model, and agent-runtime preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'draft-social'],
    evidenceRequired: ['project identity', 'model or agent scope', 'cost cap', 'secret-safe configuration plan'],
    rollback: 'Discard the preview; no API key, project, agent, or billable request is created.',
  },
  {
    id: 'hubspot',
    role: 'CRM object, outreach, association, and mutation-readiness preview.',
    mode: 'preview',
    sideEffectClass: 'none',
    credentialBoundary: 'connector-owned',
    supportedActions: ['inspect', 'plan', 'send-email'],
    evidenceRequired: ['portal or workspace identity', 'record identifiers', 'association plan', 'mutation receipt plan'],
    rollback: 'Discard the preview; no CRM record, association, note, task, or message is changed.',
  },
] as const;

export const FOUNDER_OS_LAB_ACTION_ROUTES: Readonly<Record<FounderOsLabAction, FounderOsLabActionRoute>> = {
  inspect: {
    specialistSkill: 'repo-truth',
    defaultCommand: 'truthmode',
    defaultProvider: 'github',
    capabilities: ['founder-routing', 'repository-inspection', 'proof-validation'],
    adapters: ['repository-preview'],
    approvalRequired: false,
  },
  plan: {
    specialistSkill: 'goalfix',
    defaultCommand: 'goalfix',
    defaultProvider: 'chatgpt',
    capabilities: ['founder-routing', 'proof-validation'],
    adapters: [],
    approvalRequired: false,
  },
  'draft-social': {
    specialistSkill: 'proof-led-publishing',
    defaultCommand: 'build',
    defaultProvider: 'chatgpt',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: false,
  },
  'queue-social': {
    specialistSkill: 'proof-led-publishing',
    defaultCommand: 'loop',
    defaultProvider: 'zapier',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: true,
  },
  'publish-social': {
    specialistSkill: 'proof-led-publishing',
    defaultCommand: 'truthmode',
    defaultProvider: 'zapier',
    capabilities: ['founder-routing', 'proof-validation', 'social-draft-validation', 'buffer-handoff-preview'],
    adapters: ['first-party-social-validator', 'buffer-preview'],
    approvalRequired: true,
  },
  'merge-code': {
    specialistSkill: 'review-verify-merge',
    defaultCommand: 'loop',
    defaultProvider: 'github',
    capabilities: ['founder-routing', 'repository-inspection', 'proof-validation', 'merge-readiness-preview'],
    adapters: ['repository-preview', 'merge-preview'],
    approvalRequired: true,
  },
  'deploy-code': {
    specialistSkill: 'goalfix',
    defaultCommand: 'goalfix',
    defaultProvider: 'cloudflare',
    capabilities: ['founder-routing', 'proof-validation', 'deployment-readiness-preview'],
    adapters: ['deployment-preview'],
    approvalRequired: true,
  },
  'send-email': {
    specialistSkill: 'proof-led-publishing',
    defaultCommand: 'build',
    defaultProvider: 'hubspot',
    capabilities: ['founder-routing', 'proof-validation', 'outreach-readiness-preview'],
    adapters: ['email-preview'],
    approvalRequired: true,
  },
};

export function founderOsLabCommand(id: FounderOsLabCommandId): FounderOsLabCommandDescriptor {
  const descriptor = FOUNDER_OS_LAB_COMMANDS.find((candidate) => candidate.id === id);
  if (!descriptor) throw new Error(`Unknown Founder OS command: ${id}`);
  return descriptor;
}

export function founderOsLabProvider(id: FounderOsLabProviderId): FounderOsLabProviderDescriptor {
  const descriptor = FOUNDER_OS_LAB_PROVIDERS.find((candidate) => candidate.id === id);
  if (!descriptor) throw new Error(`Unknown Founder OS provider: ${id}`);
  return descriptor;
}
