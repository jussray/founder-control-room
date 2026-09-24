import { describe, expect, it } from 'vitest';

import {
  FCR_CONTENT_FOUNDRY_STAGES,
  FCR_CONTENT_PACKET_FIELDS,
  isFcrContentGoal,
  routeContentFoundryCouncil,
} from '../contentFoundryCouncil.js';
import { routeFcrSkills } from '../fcrSkillRouter.js';

const HEAD = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

describe('FCR Content Foundry Council policy', () => {
  it('binds content work to one ordered packet-to-learning loop', () => {
    const decision = routeContentFoundryCouncil(
      'Build a YouTube video from this founder story and repurpose it.',
      'draft',
    );

    expect(decision.applies).toBe(true);
    expect(decision.stages).toEqual([...FCR_CONTENT_FOUNDRY_STAGES]);
    expect(decision.packetFields).toEqual([...FCR_CONTENT_PACKET_FIELDS]);
    expect(decision.stages).toEqual([
      'discover',
      'score',
      'package',
      'script',
      'LEEVIZE',
      'proof-check',
      'publish-package',
      'repurpose',
      'measure',
      'learn',
    ]);
    expect(decision.requiredProof.join(' ')).toMatch(/package is decided before script/);
    expect(decision.requiredProof.join(' ')).toMatch(/LEEVIZE/);
    expect(decision.requiredProof.join(' ')).toMatch(/WORLD FOOTAGE and PROOF FOOTAGE/);
    expect(decision.requiredProof.join(' ')).toMatch(/same canonical content fingerprint/);
    expect(decision.authority.authorizesPublish).toBe(false);
  });

  it('does not treat a generic engineering goal as content production', () => {
    expect(isFcrContentGoal('Repair the repository typecheck failure.')).toBe(false);
    const decision = routeContentFoundryCouncil('Repair the repository typecheck failure.', 'write');
    expect(decision.applies).toBe(false);
    expect(decision.stages).toEqual([]);
    expect(decision.requiredProof).toEqual([]);
  });

  it('requires the existing proof-led-publishing capability only at the publish gate', () => {
    const draft = routeContentFoundryCouncil('Draft a LinkedIn post.', 'draft');
    const publish = routeContentFoundryCouncil('Publish the LinkedIn post.', 'publish');

    expect(draft.policyRequiredCapabilityIds).not.toContain('proof-led-publishing');
    expect(publish.policyRequiredCapabilityIds).toContain('proof-led-publishing');
    expect(publish.requiredProof.join(' ')).toMatch(/separate current approval/);
  });

  it('threads Content Foundry through the automatic FCR skill router without granting execution', () => {
    const decision = routeFcrSkills({
      goal: 'Publish a YouTube product demo with screenshots and repurpose it for social.',
      action: 'publish',
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      expectedRegistryHash: REGISTRY_HASH,
    });

    expect(decision.contentFoundry.applies).toBe(true);
    expect(decision.contentFoundry.stages).toEqual([...FCR_CONTENT_FOUNDRY_STAGES]);
    expect(decision.policyRequiredCapabilityIds).toContain('proof-led-publishing');
    expect(decision.requiredTools).toContain('playwright');
    expect(decision.requiredProof).toContain('exact-head Playwright evidence for UI/runtime claims');
    expect(decision.requiredProof.join(' ')).toMatch(/canonical content packet declares/);
    expect(decision.requiredProof.join(' ')).toMatch(/action-specific authority/);
    expect(decision.executionAllowed).toBe(false);
    expect(decision.status).toBe('blocked');
  });
});
