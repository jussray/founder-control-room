import { describe, expect, it } from 'vitest';
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

describe('portable Founder OS registry', () => {
  it('contains the complete checked-in command contract with no execution authority', () => {
    expect(FOUNDER_OS_LAB_COMMANDS.map((command) => command.id)).toEqual(EXPECTED_COMMANDS);
    expect(FOUNDER_OS_LAB_COMMANDS.every((command) => command.mayExecute === false)).toBe(true);
    expect(founderOsLabCommand('elonmusk').role).toMatch(/lens only/i);
    expect(founderOsLabCommand('elonmusk').role).toMatch(/never simulate a person/i);
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

  it('keeps every default action route inside its provider support contract', () => {
    for (const [action, route] of Object.entries(FOUNDER_OS_LAB_ACTION_ROUTES)) {
      const command = founderOsLabCommand(route.defaultCommand);
      const provider = founderOsLabProvider(route.defaultProvider);

      expect(command.mayExecute).toBe(false);
      expect(provider.supportedActions).toContain(action);
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
    expect(plan.route.command).toMatchObject({
      id: 'confess',
      specialistSkill: 'repo-truth',
    });
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
  });

  it('blocks executor readiness when approval exists without required provider evidence', () => {
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
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      id: 'github',
      executionAllowed: false,
      preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceObserved: [],
      preflightEvidenceMissing: ['repository', 'commitSha', 'proofUrls'],
    });
    expect(plan.truth.blocked.join(' ')).toContain(
      'Missing required github preflight evidence: repository, commitSha, proofUrls',
    );
    expect(plan.nextGate).toContain('Supply the missing github preflight evidence');
  });

  it('recognizes approval and complete evidence without transferring execution authority', () => {
    const plan = planFounderOsLab({
      goal: 'Preview the exact-head merge gate.',
      action: 'merge-code',
      command: 'loop',
      provider: 'github',
      approval: {
        id: 'founder-approved:merge-preview-only',
        actions: ['merge-code'],
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.readiness).toBe('ready_for_external_executor');
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      executionAllowed: false,
      preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceObserved: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceMissing: [],
    });
    expect(plan.nextGate).toContain('separately authorize one named external adapter for github');
  });
});
