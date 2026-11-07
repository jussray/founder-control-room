import { describe, expect, it } from 'vitest';

import {
  FCR_STORYENGINE_COURT_CONTRACT,
  FCR_STORYENGINE_CREATIVE_FREEDOM_RULE,
  routeStoryEngineCourt,
} from '../storyEngineCourt.js';

describe('StoryEngine three-council Court contract', () => {
  it('convenes all three domain councils for StoryEngine creative work without flattening their roles', () => {
    const decision = routeStoryEngineCourt(
      'Imagine the world, then write the opening scene and decide how it should feel.',
      'StoryEngine',
    );

    expect(decision.contract).toBe(FCR_STORYENGINE_COURT_CONTRACT);
    expect(decision.applies).toBe(true);
    expect(decision.creativeFreedomRule).toBe(FCR_STORYENGINE_CREATIVE_FREEDOM_RULE);
    expect(decision.councils.map((council) => council.id)).toEqual(['writers', 'ai', 'production']);
    expect(decision.independentFirst).toBe(true);
    expect(decision.devilCrossExaminationRequired).toBe(true);
    expect(decision.creatorFinalAuthority).toBe(true);
    expect(decision.preserveDissent).toBe(true);
    expect(decision.toolCapabilityGrantsPermission).toBe(false);
  });

  it('keeps creator escape hatches and editable creative intent mandatory', () => {
    const decision = routeStoryEngineCourt('Shape this StoryEngine idea.', 'StoryEngine');

    expect(decision.userFreedom.presetsAreOptionalShortcuts).toBe(true);
    expect(decision.userFreedom.otherOrCustomMustRemainAvailable).toBe(true);
    expect(decision.userFreedom.freeTextEscapeHatchRequired).toBe(true);
    expect(decision.userFreedom.importantChoicesEditableLater).toBe(true);
    expect(decision.userFreedom.baseContextIsDurableCreativeIntent).toBe(true);
    expect(decision.userFreedom.escapeRoutes).toEqual(expect.arrayContaining([
      'keep-mine',
      'blend',
      'try-another-direction',
      'challenge-the-ruling',
      'custom-direction-free-text',
    ]));
  });

  it('requires Devil as a policy capability and preserves real-vs-simulated provider truth', () => {
    const decision = routeStoryEngineCourt('/MAKEVIDEO turn this StoryEngine chapter into a cinematic sequence.', 'StoryEngine');

    expect(decision.phase).toBe('video');
    expect(decision.policyRequiredCapabilityIds).toEqual(['devil']);
    expect(decision.providerTruthRule).toBe('live-requires-verified-provider-receipt');
    expect(decision.simulatedRoleRule).toBe('simulated-roles-must-be-labeled-simulated');
    expect(decision.requiredProof.join(' ')).toMatch(/tool capability is not permission/i);
    expect(decision.requiredProof.join(' ')).toMatch(/Other\/Custom/i);
  });

  it('does not hijack unrelated FCR work', () => {
    const decision = routeStoryEngineCourt('Review the FCR deployment receipts.', 'founder-control-room');

    expect(decision.applies).toBe(false);
    expect(decision.phase).toBeNull();
    expect(decision.councils).toEqual([]);
    expect(decision.policyRequiredCapabilityIds).toEqual([]);
    expect(decision.receiptFields).toEqual([]);
  });
});
