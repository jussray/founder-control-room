import { describe, expect, it } from 'vitest';

import {
  FCR_DECLARED_ROUTABLE_SKILL_IDS,
  FCR_SKILL_ROUTER_CONTRACT,
  routeFcrSkills,
} from '../fcrSkillRouter.js';

describe('FCR skill router', () => {
  it('routes a repository repair through repo truth, goalfix, merge review, and GitHub evidence', () => {
    const decision = routeFcrSkills({
      goal: 'Audit GitHub main, fix the failing code, verify the exact head, and merge the focused repair.',
    });

    expect(decision.contract).toBe(FCR_SKILL_ROUTER_CONTRACT);
    expect(decision.selectedDeclaredSkillIds).toEqual(expect.arrayContaining([
      'skill:repo-truth',
      'skill:goalfix',
      'skill:review-verify-merge',
      'skill:control-room-proof-ladder',
      'skill:control-room-agent-router',
    ]));
    expect(decision.requiredTools).toContain('github');
    expect(decision.requiredProof).toEqual(expect.arrayContaining([
      'authoritative repository, branch, and exact commit SHA',
      'focused cause, reversible patch, and narrow verification',
      'exact-head checks and unresolved review-thread state',
    ]));
    expect(decision.mutationRequested).toBe(true);
    expect(decision.runtimeDiscoveryRequired).toBe(true);
    expect(decision.nextGate).toMatch(/discover runtime skill availability/i);
  });

  it('requires Playwright and runtime Product Design discovery for UI/runtime work', () => {
    const decision = routeFcrSkills({
      goal: 'Implement the Figma screen in the frontend and verify the mobile UI in Playwright.',
    });

    expect(decision.intents).toContain('ui-runtime');
    expect(decision.runtimeSkillRequests).toContain('product-design');
    expect(decision.requiredTools).toContain('playwright');
    expect(decision.requiredProof).toContain('exact-head Playwright evidence for UI/runtime claims');
    expect(decision.requestedSkillIds).not.toContain('skill:control-room-design-implementation');
  });

  it('requests the narrow Codex Security skill for a PR security review', () => {
    const decision = routeFcrSkills({
      goal: 'Review this PR diff for security vulnerabilities before merge.',
    });

    expect(decision.intents).toContain('security');
    expect(decision.runtimeSkillRequests).toContain('codex-security:security-diff-scan');
    expect(decision.runtimeSkillRequests).not.toContain('codex-security:security-scan');
    expect(decision.nextGate).toMatch(/discover runtime skill availability/i);
  });

  it('requests finding repair only when the goal asks to remediate a security finding', () => {
    const decision = routeFcrSkills({
      goal: 'Fix the validated vulnerability finding in this branch and verify the patch.',
    });

    expect(decision.runtimeSkillRequests).toEqual(expect.arrayContaining([
      'codex-security:security-diff-scan',
      'codex-security:fix-finding',
    ]));
    expect(decision.selectedDeclaredSkillIds).toEqual(expect.arrayContaining([
      'skill:goalfix',
      'skill:repo-truth',
      'skill:review-verify-merge',
    ]));
  });

  it('honors explicit skill requests without pretending undeclared skills are available', () => {
    const decision = routeFcrSkills({
      goal: '/goalfix repair this.',
      declaredSkillIds: [],
    });

    expect(decision.selectedDeclaredSkillIds).toEqual([]);
    expect(decision.undeclaredSkillIds).toContain('skill:goalfix');
    expect(decision.nextGate).toMatch(/discover runtime skill availability/i);
  });

  it('routes publishing separately from repository mutation', () => {
    const decision = routeFcrSkills({
      goal: 'Draft a proof-led LinkedIn post from the verified release receipts.',
    });

    expect(decision.intents).toContain('publishing');
    expect(decision.selectedDeclaredSkillIds).toContain('skill:proof-led-publishing');
    expect(decision.requiredProof).toContain('public claim backed by current proof');
  });

  it('uses Chief AI as the narrow fallback instead of selecting every skill', () => {
    const decision = routeFcrSkills({
      goal: 'Help me decide what to do next.',
    });

    expect(decision.selectedDeclaredSkillIds).toEqual(['skill:juss-chief-ai']);
    expect(decision.intents).toEqual(['strategy']);
    expect(decision.runtimeSkillRequests).toEqual([]);
    expect(decision.nextGate).toMatch(/discover runtime skill availability/i);
  });

  it('keeps the checked-in router policy explicit and finite', () => {
    expect(FCR_DECLARED_ROUTABLE_SKILL_IDS).toEqual([
      'skill:juss-chief-ai',
      'skill:goalfix',
      'skill:repo-truth',
      'skill:proof-led-publishing',
      'skill:review-verify-merge',
      'skill:control-room-agent-router',
      'skill:control-room-proof-ladder',
      'skill:control-room-incident-triage',
      'skill:control-room-skill-router',
    ]);
  });
});
