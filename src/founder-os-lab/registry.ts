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
  role: string;
  class: 'founder' | 'strategic' | 'truth' | 'execution' | 'creative';
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
  defaultCommand: FounderOsLabCommandId;
  defaultProvider: FounderOsLabProviderId;
  capabilities: FounderOsLabCapabilityId[];
  adapters: FounderOsLabAdapterId[];
  approvalRequired: boolean;
}

export const FOUNDER_OS_LAB_SKILLS: readonly FounderOsLabSkillDescriptor[] = [
  { id: 'juss-chief-ai', role: 'Chief AI capability selection and founder-intent translation.', mayExecute: false },
  { id: 'goalfix', role: 'Founder-native focused diagnosis capability inventory entry.', mayExecute: false },
  { id: 'repo-truth', role: 'Founder-native repository truth capability inventory entry.', mayExecute: false },
  { id: 'truth-decay-audit', role: 'Explain why once-verified evidence is no longer safe for current use without becoming a second truth authority.', mayExecute: false },
  { id: 'proof-led-publishing', role: 'Founder-native proof-led publishing capability inventory entry.', mayExecute: false },
  { id: 'review-verify-merge', role: 'Founder-native merge-verification capability inventory entry.', mayExecute: false },
] as const;

export const FOUNDER_OS_LAB_COMMANDS: readonly FounderOsLabCommandDescriptor[] = [
  { id: 'human', role: 'Center present-founder intent, constraints, agency, and human consequences.', class: 'founder', mayExecute: false },
  { id: 'futureyou', role: 'Challenge the decision against long-horizon continuity and compounding value.', class: 'founder', mayExecute: false },
  { id: 'v10', role: 'Synthesize present founder, FutureYou, strategic lenses, truth, capability, proof, and next gate.', class: 'founder', mayExecute: false },
  { id: 'goalfix', role: 'Diagnose one failure and identify the smallest reversible evidence-backed fix.', class: 'execution', mayExecute: false },
  { id: 'ultrathink', role: 'Expand the option space, reconcile constraints, and surface the highest-leverage path.', class: 'strategic', mayExecute: false },
  { id: 'truthmode', role: 'Separate VERIFIED, INFERRED, UNKNOWN, and BLOCKED claims against supplied evidence.', class: 'truth', mayExecute: false },
  { id: 'confess', role: 'Expose unsupported assumptions, missing inspection, stale evidence, and overclaimed certainty.', class: 'truth', mayExecute: false },
  { id: 'redteam', role: 'Challenge whether the proposed change should exist and how it could fail or be gamed.', class: 'truth', mayExecute: false },
  { id: 'lindymode', role: 'Prefer durable, reversible, low-dependency primitives over novelty and brittle coupling.', class: 'strategic', mayExecute: false },
  { id: 'ooda', role: 'Observe, orient, decide, act in preview, verify, and define the next loop.', class: 'execution', mayExecute: false },
  { id: 'visualize', role: 'Translate verified state into an editable visual plan without provider mutation.', class: 'creative', mayExecute: false },
  { id: 'build', role: 'Shape one implementation-ready slice with proof, rollback, and authority boundaries.', class: 'execution', mayExecute: false },
  { id: 'billgates', role: 'Apply systems, platform, distribution, standards, and compounding-leverage pressure.', class: 'strategic', mayExecute: false },
  { id: 'elonmusk', role: 'Apply first-principles deletion, bottleneck, simplification, and speed pressure without simulating a person.', class: 'strategic', mayExecute: false },
  { id: 'firstprinciples', role: 'Decompose assumptions to irreducible constraints and rebuild the smallest valid solution.', class: 'strategic', mayExecute: false },
  { id: 'socrates', role: 'Interrogate premises with questions that expose contradictions and missing evidence.', class: 'strategic', mayExecute: false },
  { id: 'ycombinator', role: 'Pressure-test user need, urgency, distribution, retention, and smallest launchable wedge.', class: 'strategic', mayExecute: false },
  { id: 'antiadvice', role: 'Generate the strongest case against the default recommendation before committing.', class: 'strategic', mayExecute: false },
  { id: 'hormozi', role: 'Pressure-test offer clarity, value, friction, proof, and conversion without copying protected expression.', class: 'strategic', mayExecute: false },
  { id: 'unlearn', role: 'Identify inherited assumptions that current evidence no longer supports.', class: 'strategic', mayExecute: false },
  { id: 'loop', role: 'Repeat audit, focused repair, exact-head verification, review, and next-gate selection without carrying approval forward.', class: 'execution', mayExecute: false },
] as const;

export const FOUNDER_OS_LAB_CAPABILITIES: readonly FounderOsLabCapabilityDescriptor[] = [
  { id: 'founder-routing', role: 'Convert a founder goal into one bounded workstream.', sideEffectClass: 'none' },
  { id: 'repository-inspection', role: 'Plan repository evidence reads without performing them.', sideEffectClass: 'none' },
  { id: 'proof-validation', role: 'Validate supplied evidence shape and truth boundaries.', sideEffectClass: 'none' },
  { id: 'capability-plan-validation', role: 'Validate the Chief AI capability plan against the active goal, project, and exact head.', sideEffectClass: 'none' },
  { id: 'capability-provenance-validation', role: 'Validate registry/source hashes, origin, owner, and authority ceilings.', sideEffectClass: 'none' },
  { id: 'authority-boundary-validation', role: 'Ensure prompts, models, skills, workflows, and provider data cannot expand authority.', sideEffectClass: 'none' },
  { id: 'decision-card-preview', role: 'Shape founder-facing goal, truth, strategy, capability, authority, proof, and next-gate state.', sideEffectClass: 'none' },
  { id: 'outcome-observation-preview', role: 'Define measurable outcome signals without claiming an observed result.', sideEffectClass: 'none' },
  { id: 'social-draft-validation', role: 'Run the existing pure social-post validator.', sideEffectClass: 'none' },
  { id: 'buffer-handoff-preview', role: 'Describe a Buffer handoff without invoking Buffer or Zapier.', sideEffectClass: 'none' },
  { id: 'merge-readiness-preview', role: 'Describe merge gates without mutating GitHub.', sideEffectClass: 'none' },
  { id: 'deployment-readiness-preview', role: 'Describe deployment gates without provider calls.', sideEffectClass: 'none' },
  { id: 'outreach-readiness-preview', role: 'Describe outreach gates without sending email or mutating CRM.', sideEffectClass: 'none' },
] as const;

export const FOUNDER_OS_LAB_PROVIDERS: readonly FounderOsLabProviderDescriptor[] = [
  { id: 'chatgpt', role: 'Conversation, synthesis, drafting, and planning preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'draft-social'], evidenceRequired: ['model identity', 'request scope', 'sanitized output receipt'], rollback: 'Discard the preview response; no external state exists.' },
  { id: 'claude', role: 'Long-context analysis, drafting, and implementation-plan preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'draft-social'], evidenceRequired: ['model identity', 'request scope', 'sanitized output receipt'], rollback: 'Discard the preview response; no external state exists.' },
  { id: 'codex', role: 'Repository inspection, implementation, merge, and deployment-readiness preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'merge-code', 'deploy-code'], evidenceRequired: ['repository', 'branch', 'exact commit SHA', 'named verification plan'], rollback: 'Discard the preview; no branch, commit, merge, or deployment is created.' },
  { id: 'perplexity', role: 'Read-only external research and source-receipt preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan'], evidenceRequired: ['research scope', 'source receipts', 'freshness timestamp', 'output hash'], rollback: 'Discard the research preview and retain no provider state.' },
  { id: 'github', role: 'Repository, branch, pull request, exact-head, checks, and review preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'merge-code'], evidenceRequired: ['repository', 'base branch', 'candidate head SHA', 'checks', 'review threads'], rollback: 'Discard the preview; no repository reference is changed.' },
  { id: 'supabase', role: 'Project, migration, advisor, authorization, and database-readiness preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'deploy-code'], evidenceRequired: ['project identifier', 'migration ledger', 'advisor receipt', 'role boundary'], rollback: 'Discard the preview; no query, migration, policy, or data mutation occurs.' },
  { id: 'cloudflare', role: 'Cloudflare compute, Pages, build, deployment, DNS, and runtime-readiness preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'deploy-code'], evidenceRequired: ['account identifier', 'project name', 'source SHA', 'build or deployment receipt', 'runtime read-back plan'], rollback: 'Discard the preview; no Cloudflare compute, Pages, DNS, route, or secret state changes.' },
  { id: 'zapier', role: 'Automation topology, task budget, review window, and run-receipt preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'queue-social', 'publish-social', 'send-email'], evidenceRequired: ['Zap identity', 'trigger/action schema', 'task budget', 'run receipt plan'], rollback: 'Discard the preview; no Zap, task, schedule, email, or publication action runs.' },
  { id: 'figma', role: 'Editable design artifact, component, and handoff preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan'], evidenceRequired: ['file or project identity', 'editable-layer requirement', 'source-requirement trace'], rollback: 'Discard the preview; no design file or component is created or changed.' },
  { id: 'openai-platform', role: 'OpenAI API project, key-boundary, model, and agent-runtime preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'draft-social'], evidenceRequired: ['project identity', 'model or agent scope', 'cost cap', 'secret-safe configuration plan'], rollback: 'Discard the preview; no API key, project, agent, or billable request is created.' },
  { id: 'hubspot', role: 'CRM object, outreach, association, and mutation-readiness preview.', mode: 'preview', sideEffectClass: 'none', credentialBoundary: 'connector-owned', supportedActions: ['inspect', 'plan', 'send-email'], evidenceRequired: ['portal or workspace identity', 'typed record identifiers', 'association plan', 'separate dispatch-gate plan'], rollback: 'Discard the preview; no CRM record, association, note, task, or message is changed.' },
] as const;

const V10_BASE_CAPABILITIES: FounderOsLabCapabilityId[] = [
  'founder-routing',
  'proof-validation',
  'capability-plan-validation',
  'capability-provenance-validation',
  'authority-boundary-validation',
  'decision-card-preview',
  'outcome-observation-preview',
];

export const FOUNDER_OS_LAB_ACTION_ROUTES: Readonly<Record<FounderOsLabAction, FounderOsLabActionRoute>> = {
  inspect: { defaultCommand: 'truthmode', defaultProvider: 'github', capabilities: [...V10_BASE_CAPABILITIES, 'repository-inspection'], adapters: ['repository-preview'], approvalRequired: false },
  plan: { defaultCommand: 'v10', defaultProvider: 'chatgpt', capabilities: [...V10_BASE_CAPABILITIES], adapters: [], approvalRequired: false },
  'draft-social': { defaultCommand: 'build', defaultProvider: 'chatgpt', capabilities: [...V10_BASE_CAPABILITIES, 'social-draft-validation', 'buffer-handoff-preview'], adapters: ['first-party-social-validator', 'buffer-preview'], approvalRequired: false },
  'queue-social': { defaultCommand: 'loop', defaultProvider: 'zapier', capabilities: [...V10_BASE_CAPABILITIES, 'social-draft-validation', 'buffer-handoff-preview'], adapters: ['first-party-social-validator', 'buffer-preview'], approvalRequired: true },
  'publish-social': { defaultCommand: 'truthmode', defaultProvider: 'zapier', capabilities: [...V10_BASE_CAPABILITIES, 'social-draft-validation', 'buffer-handoff-preview'], adapters: ['first-party-social-validator', 'buffer-preview'], approvalRequired: true },
  'merge-code': { defaultCommand: 'loop', defaultProvider: 'github', capabilities: [...V10_BASE_CAPABILITIES, 'repository-inspection', 'merge-readiness-preview'], adapters: ['repository-preview', 'merge-preview'], approvalRequired: true },
  'deploy-code': { defaultCommand: 'goalfix', defaultProvider: 'cloudflare', capabilities: [...V10_BASE_CAPABILITIES, 'deployment-readiness-preview'], adapters: ['deployment-preview'], approvalRequired: true },
  'send-email': { defaultCommand: 'build', defaultProvider: 'hubspot', capabilities: [...V10_BASE_CAPABILITIES, 'outreach-readiness-preview'], adapters: ['email-preview'], approvalRequired: true },
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
