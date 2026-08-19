import { describe, expect, it } from 'vitest';
import {
  evaluateFreeFirstCostGate,
  FREE_FIRST_EXECUTION_POLICY_VERSION,
  isExecutionCostCurrentlyAuthorized,
  missionRequiresFreeFirst,
} from '../freeFirstExecutionPolicy.js';
import { listTerminalCommands, TERMINAL_COMMANDS } from '../../terminal/registry.js';

describe('free-first execution policy', () => {
  it('keeps the policy version explicit', () => {
    expect(FREE_FIRST_EXECUTION_POLICY_VERSION).toBe('free-first-v1');
  });

  it('recognizes repository repair missions as free-first even before trigger enrichment', () => {
    expect(missionRequiresFreeFirst({ source: 'repository_verification' })).toBe(true);
  });

  it('recognizes explicit zero-budget prefer-free constraints', () => {
    expect(missionRequiresFreeFirst({
      founder_constraints: {
        monthly_budget: 0,
        prefer_free: true,
      },
    })).toBe(true);
  });

  it('does not invent free-first authority from malformed or partial policy', () => {
    expect(missionRequiresFreeFirst(null)).toBe(false);
    expect(missionRequiresFreeFirst({ founder_constraints: [] })).toBe(false);
    expect(missionRequiresFreeFirst({ founder_constraints: { monthly_budget: 0 } })).toBe(false);
    expect(missionRequiresFreeFirst({ founder_constraints: { prefer_free: true } })).toBe(false);
  });

  it('allows free and already-included execution classes', () => {
    expect(isExecutionCostCurrentlyAuthorized('free')).toBe(true);
    expect(isExecutionCostCurrentlyAuthorized('included')).toBe(true);

    expect(evaluateFreeFirstCostGate({
      policySnapshot: { source: 'repository_verification' },
      costClass: 'included',
    })).toEqual({
      allowed: true,
      governed: true,
      reason: 'free_or_included_execution',
    });
  });

  it('fails closed for metered and paid execution because no paid-commitment receipt path exists', () => {
    expect(isExecutionCostCurrentlyAuthorized('metered')).toBe(false);
    expect(isExecutionCostCurrentlyAuthorized('paid')).toBe(false);

    for (const costClass of ['metered', 'paid'] as const) {
      expect(evaluateFreeFirstCostGate({
        policySnapshot: { source: 'repository_verification' },
        costClass,
      })).toEqual({
        allowed: false,
        governed: true,
        reason: 'paid_fallback_not_authorized',
      });
    }
  });

  it('does not let free-first policy rewrite authority for unrelated missions', () => {
    expect(evaluateFreeFirstCostGate({
      policySnapshot: { source: 'manual_founder_mission' },
      costClass: 'paid',
    })).toEqual({
      allowed: true,
      governed: false,
      reason: 'mission_not_free_first',
    });
  });
});

describe('terminal registry cost membrane', () => {
  it('classifies every current allowlisted command explicitly', () => {
    expect(TERMINAL_COMMANDS.length).toBeGreaterThan(0);
    for (const command of TERMINAL_COMMANDS) {
      expect(['free', 'included', 'metered', 'paid']).toContain(command.costClass);
    }
  });

  it('never exposes an unauthorized cost class through project command listings', () => {
    const projectSlugs = new Set(TERMINAL_COMMANDS.map((command) => command.projectSlug));
    for (const projectSlug of projectSlugs) {
      const visible = listTerminalCommands(projectSlug);
      expect(visible.length).toBeGreaterThan(0);
      for (const command of visible) {
        expect(isExecutionCostCurrentlyAuthorized(command.costClass)).toBe(true);
      }
    }
  });
});
