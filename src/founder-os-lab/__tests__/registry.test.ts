import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';
import { planFounderOsLab } from '../engine.js';
import { FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE } from '../providerEvidence.js';
import {
  FOUNDER_OS_LAB_ACTION_ROUTES,
  FOUNDER_OS_LAB_COMMANDS,
  FOUNDER_OS_LAB_PROVIDERS,
  founderOsLabCommand,
  founderOsLabProvider,
} from '../registry.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = `https://github.com/jussray/founder-control-room/commit/${SHA}`;

const EXPECTED_COMMANDS = [
  'human',
  'futureyou',
  'v10',
  'goalfix',
  'ultrathink',
  'truthmode',
  'confess',
  'redteam',
  'lindymode',
  'ooda',
  'visualize',
  'build',
  'billgates',
  'elonmusk',
  'firstprinciples',
  'socrates',
  'ycombinator',
  'antiadvice',
  'hormozi',
  'unlearn',
  'loop',
] as const;

const EXPECTED_PROVIDERS = [
  'chatgpt',
  'claude',
  'codex',
  'perplexity',
  'github',
  'supabase',
  'cloudflare',
  'zapier',
  'figma',
  'openai-platform',
  'hubspot',
] as const;

function capabilityPlan(overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Preview the exact-head merge gate.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['human', 'futureyou', 'truthmode'],
    routingReason: 'Chief AI selected the smallest evidence-bound review capability.',
    capabilities: [{
      id: 'review-verify-merge',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head checks', 'review-thread evidence'],
    outcomeSignals: ['merge-readiness-verified'],
    rollback: 'Discard the preview; no mutation occurs.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

describe('portable Founder OS registry', () => {
  it('contains the complete checked-in V10 command contract with no execution authority', () => {
    expect(FOUNDER_OS_LAB_COMMANDS.map((command) => command.id)).toEqual(EXPECTED_COMMANDS);
    expect(FOUNDER_OS_LAB_COMMANDS.every((command) => command.mayExecute === false)).toBe(true);
    expect(founderOsLabCommand('human').class).toBe('founder');
    expect(founderOsLabCommand('futureyou').class).toBe('founder');
    expect(founderOsLabCommand('elonmusk').role).toMatch(/first-principles/i);
    expect(founderOsLabCommand('elonmusk').role).toMatch(/without simulating a person/i);
  });

  it('contains the complete provider registry as preview-only, side-effect-free descriptors', () => {
    expect(FOUNDER_OS_LAB_PROVIDERS.map((provider) => provider.id)).toEqual(EXPECTED_PROVIDERS);
    expect(Object.keys(FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE)).toEqual(EXPECTED_PROVIDERS);

    for (const provider of FOUNDER_OS_LAB_PROVIDERS) {
      expect(provider.mode).toBe('preview');
      expect(provider.sideEffectClass).toBe('none');
      expect(provider.supportedActions.length).toBeGreaterThan(0);
      expect(provider.evidenceRequired.length).toBeGreaterThan(0);
      expect(provider.rollback.trim()).not.toBe('');
      expect(FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE[provider.id]).toBeDefined();
    }
  });

  it('keeps descriptive provider evidence aligned with executable preflight truth', () => {
    expect(founderOsLabProvider('cloudflare').evidenceRequired).toEqual(
      expect.arrayContaining(['account identifier', 'project name']),
    );
    expect(founderOsLabProvider('hubspot').evidenceRequired).toEqual(
      expect.arrayContaining([
        'portal or workspace identity',
        'typed record identifiers',
        'association plan',
        'separate dispatch-gate plan',
      ]),
    );
    expect(founderOsLabProvider('hubspot').evidenceRequired.join(' ')).not.toMatch(/mutation receipt/i);
  });

  it('keeps every default action route inside its provider support contract without choosing a specialist', () => {
    for (const [action, route] of Object.entries(FOUNDER_OS_LAB_ACTION_ROUTES)) {
      const command = founderOsLabCommand(route.defaultCommand);
      const provider = founderOsLabProvider(route.defaultProvider);

      expect(command.mayExecute).toBe(false);
      expect(provider.supportedActions).toContain(action);
      expect(route).not.toHaveProperty('specialistSkill');
    }
  });

  it('returns explicit command and provider metadata while retaining L0 isolation', () => {
    const plan = planFounderOsLab({
      goal: 'Inspect the current exact head and explain the smallest safe next gate.',
      action: 'inspect',
      command: 'confess',
      provider: 'github',
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.route.command).toMatchObject({ id: 'confess', class: 'truth' });
    expect(plan.route).not.toHaveProperty('specialistSkill');
    expect(plan.route.capabilityPlan.observed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      id: 'github',
      mode: 'preview',
      supported: true,
      executionAllowed: false,
      credentialBoundary: 'connector-owned',
      preflightEvidenceRequired: [],
      preflightEvidenceObserved: [],
      preflightEvidenceMissing: [],
    });
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.authority.capabilityPlanBound).toBe(false);
    expect(plan.isolation.providerCalls).toBe(false);
  });

  it('fails closed when a provider does not support the selected action', () => {
    const plan = planFounderOsLab({
      goal: 'Preview a merge decision in the design provider.',
      action: 'merge-code',
      command: 'loop',
      provider: 'figma',
      approval: {
        id: 'founder-approved:merge-preview-only',
        actions: ['merge-code'],
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.route.provider).toMatchObject({
      id: 'figma',
      supported: false,
      executionAllowed: false,
    });
    expect(plan.truth.blocked.join(' ')).toContain('figma does not support a merge-code preview');
    expect(plan.truth.blocked.join(' ')).toContain('valid Chief AI capability plan is required');
  });

  it('blocks executor readiness when approval exists without provider evidence or a Chief AI plan', () => {
    const plan = planFounderOsLab({
      goal: 'Preview the exact-head merge gate.',
      action: 'merge-code',
      command: 'loop',
      provider: 'github',
      approval: {
        id: 'founder-approved:merge-preview-only',
        actions: ['merge-code'],
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.authority.approvalObserved).toBe(false);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      id: 'github',
      executionAllowed: false,
      preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceObserved: [],
      preflightEvidenceMissing: ['repository', 'commitSha', 'proofUrls'],
    });
    expect(plan.truth.blocked.join(' ')).toContain('valid Chief AI capability plan is required');
    expect(plan.truth.blocked.join(' ')).toContain(
      'Missing required github preflight evidence: repository, commitSha, proofUrls',
    );
  });

  it('recognizes plan-bound approval and complete evidence without transferring execution authority', () => {
    const cp = capabilityPlan();
    const plan = planFounderOsLab({
      goal: cp.goal,
      action: 'merge-code',
      command: 'loop',
      provider: 'github',
      capabilityPlan: cp,
      approval: {
        id: 'founder-approved:merge-preview-only',
        actions: ['merge-code'],
        projectSlug: cp.projectSlug,
        expectedHeadSha: cp.expectedHeadSha,
        capabilityPlanHash: cp.planHash,
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.readiness).toBe('ready_for_external_executor');
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.capabilityPlanBound).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.capabilityPlan).toMatchObject({
      observed: true,
      valid: true,
      selectedBy: 'chief-ai-machine',
      planHash: cp.planHash,
      registryHash: cp.registryHash,
      capabilityIds: ['review-verify-merge'],
    });
    expect(plan.route.provider).toMatchObject({
      executionAllowed: false,
      preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceObserved: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceMissing: [],
    });
    expect(plan.nextGate).toContain('Chief AI capability plan');
  });
});
