import { describe, expect, it } from 'vitest';

import {
  FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS,
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

  it('convenes the smallest default Ask Me Video council before video direction', () => {
    const decision = routeContentFoundryCouncil(
      'Make a cinematic video from this founder story.',
      'draft',
    );

    expect(decision.askMeVideoCouncil.applies).toBe(true);
    expect(decision.askMeVideoCouncil.operationalAuthority).toBe('gemini-first');
    expect(decision.askMeVideoCouncil.truthKernel).toBe('/LEEVIZE');
    expect(decision.askMeVideoCouncil.members.map((member) => member.id)).toEqual([
      'viewer-advocate',
      'story-director',
      'truth-producer',
      'continuity-director',
    ]);
    expect(decision.askMeVideoCouncil.receiptFields).toEqual([
      ...FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS,
    ]);
    expect(decision.askMeVideoCouncil.receiptFields).toContain('dissent');
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/independently/);
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/smallest useful council/);
    expect(decision.requiredProof.join(' ')).toMatch(/Ask Me Video convenes/);
  });

  it('adds only the video specialists required by product, distribution, money, and sound work', () => {
    const decision = routeContentFoundryCouncil(
      'Publish a YouTube product demo with real app runtime screenshots, voiceover, captions, and a conversion CTA.',
      'publish',
    );
    const members = decision.askMeVideoCouncil.members.map((member) => member.id);

    expect(members).toContain('runtime-proof-specialist');
    expect(members).toContain('distribution-money-specialist');
    expect(members).toContain('sound-director');
    expect(decision.policyRequiredCapabilityIds).toContain('proof-led-publishing');
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/cannot mint publish/);
  });

  it('does not treat a generic engineering goal as content production', () => {
    expect(isFcrContentGoal('Repair the repository typecheck failure.')).toBe(false);
    const decision = routeContentFoundryCouncil('Repair the repository typecheck failure.', 'write');
    expect(decision.applies).toBe(false);
    expect(decision.stages).toEqual([]);
    expect(decision.requiredProof).toEqual([]);
    expect(decision.askMeVideoCouncil.applies).toBe(false);
    expect(decision.askMeVideoCouncil.members).toEqual([]);
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
    expect(decision.contentFoundry.askMeVideoCouncil.applies).toBe(true);
    expect(decision.contentFoundry.askMeVideoCouncil.members.map((member) => member.id)).toContain(
      'runtime-proof-specialist',
    );
    expect(decision.policyRequiredCapabilityIds).toContain('proof-led-publishing');
    expect(decision.requiredTools).toContain('playwright');
    expect(decision.requiredProof).toContain('exact-head Playwright evidence for UI/runtime claims');
    expect(decision.requiredProof.join(' ')).toMatch(/canonical content packet declares/);
    expect(decision.requiredProof.join(' ')).toMatch(/action-specific authority/);
    expect(decision.executionAllowed).toBe(false);
    expect(decision.status).toBe('blocked');
  });
});
