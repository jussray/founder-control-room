import { describe, expect, it } from 'vitest';

import {
  FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS,
  FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT,
  FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT,
  FCR_CONTENT_FOUNDRY_STAGES,
  FCR_CONTENT_PACKET_FIELDS,
  createCouncilContinuityCookie,
  createCouncilContinuityFingerprint,
  isFcrContentGoal,
  routeContentFoundryCouncil,
  verifyCouncilContinuityCookieChain,
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
    expect(decision.requiredProof.join(' ')).toMatch(/append-only and hash-chained/);
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
    expect(decision.askMeVideoCouncil.receiptFields).toContain('workflow_fingerprint');
    expect(decision.askMeVideoCouncil.receiptFields).toContain('model_routing');
    expect(decision.askMeVideoCouncil.receiptFields).toContain('continuity_cookies');
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/independently/);
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/smallest useful council/);
    expect(decision.askMeVideoCouncil.deliberationRules.join(' ')).toMatch(/deterministic workflow fingerprint/);
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

  it('creates a deterministic workflow fingerprint that changes with evidence', () => {
    const base = {
      project: 'founder-control-room',
      workflowId: 'ask-me-video:launch-story',
      goal: 'Build a product launch video.',
      action: 'draft',
      packetVersion: 'packet-v3',
      sourceVersions: ['repo@abc123', 'brief@v2'],
      evidenceIds: ['runtime:42', 'research:17'],
      councilMembers: ['truth-producer', 'story-director'],
      modelRouting: [
        'claude:builder',
        'gemini:imaging',
        'perplexity:research',
        'chatgpt:orchestrator',
      ],
      decision: 'Use runtime proof before generated world footage.',
    } as const;

    const first = createCouncilContinuityFingerprint(base);
    const reordered = createCouncilContinuityFingerprint({
      ...base,
      sourceVersions: [...base.sourceVersions].reverse(),
      evidenceIds: [...base.evidenceIds].reverse(),
      councilMembers: [...base.councilMembers].reverse(),
      modelRouting: [...base.modelRouting].reverse(),
    });
    const changedEvidence = createCouncilContinuityFingerprint({
      ...base,
      evidenceIds: ['runtime:43', 'research:17'],
    });

    expect(first.contract).toBe(FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT);
    expect(first.value).toMatch(/^fp_[0-9a-f]{16}$/);
    expect(reordered.value).toBe(first.value);
    expect(changedEvidence.value).not.toBe(first.value);
  });

  it('chains continuity cookies across success and failure without allowing history rewrites', () => {
    const fingerprintOne = createCouncilContinuityFingerprint({
      project: 'founder-control-room',
      workflowId: 'ask-me-video:launch-story',
      goal: 'Build a product launch video.',
      action: 'draft',
      packetVersion: 'packet-v3',
      sourceVersions: ['repo@abc123'],
      evidenceIds: ['research:17'],
      councilMembers: ['story-director', 'truth-producer'],
      modelRouting: ['claude:builder', 'perplexity:research'],
      decision: 'Produce a proof-led first cut.',
    });

    const first = createCouncilContinuityCookie({
      project: 'founder-control-room',
      workflowId: 'ask-me-video:launch-story',
      stage: 'production-council',
      decision: 'Claude builds from Perplexity evidence; ChatGPT reconciles.',
      status: 'passed',
      workflowFingerprint: fingerprintOne.value,
      modelRouting: ['claude:builder', 'perplexity:research', 'chatgpt:orchestrator'],
      evidenceIds: ['research:17'],
      founderPreference: 'Claude is the preferred builder for now.',
      outcomeSummary: 'Council produced one evidence-bound build direction.',
      generatedAt: '2026-09-24T02:10:00.000Z',
    });

    const fingerprintTwo = createCouncilContinuityFingerprint({
      project: 'founder-control-room',
      workflowId: 'ask-me-video:launch-story',
      goal: 'Build a product launch video.',
      action: 'draft',
      packetVersion: 'packet-v3',
      sourceVersions: ['repo@abc123'],
      evidenceIds: ['research:17', 'render:first-cut'],
      councilMembers: ['story-director', 'truth-producer'],
      modelRouting: ['claude:builder', 'gemini:imaging'],
      decision: 'Repair the failed first cut and preserve the miss.',
    });

    const second = createCouncilContinuityCookie({
      project: 'founder-control-room',
      workflowId: 'ask-me-video:launch-story',
      stage: 'first-cut',
      decision: 'Revise the weak visual continuity before release.',
      status: 'failed',
      workflowFingerprint: fingerprintTwo.value,
      modelRouting: ['claude:builder', 'gemini:imaging'],
      evidenceIds: ['render:first-cut'],
      failureCause: 'Character continuity drifted between shots.',
      correction: 'Lock the visual canon before the next Gemini imaging pass.',
      outcomeSummary: 'Failure retained as learning evidence.',
      generatedAt: '2026-09-24T02:12:00.000Z',
      previousCookieHash: first.cookie_hash,
    });

    expect(first.contract).toBe(FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT);
    expect(first.cookie_hash).toMatch(/^ck_[0-9a-f]{16}$/);
    expect(second.previous_cookie_hash).toBe(first.cookie_hash);
    expect(verifyCouncilContinuityCookieChain([first, second])).toEqual({
      valid: true,
      brokenAt: null,
      reason: null,
    });

    const rewrittenFailure = { ...second, failure_cause: 'history rewritten' };
    expect(verifyCouncilContinuityCookieChain([first, rewrittenFailure])).toEqual({
      valid: false,
      brokenAt: 1,
      reason: 'cookie payload hash mismatch',
    });
  });

  it('does not treat a generic engineering goal as content production', () => {
    expect(isFcrContentGoal('Repair the repository typecheck failure.')).toBe(false);
    const decision = routeContentFoundryCouncil('Repair the repository typecheck failure.', 'write');
    expect(decision.applies).toBe(false);
    expect(decision.stages).toEqual([]);
    expect(decision.requiredProof).toEqual([]);
    expect(decision.askMeVideoCouncil.applies).toBe(false);
    expect(decision.askMeVideoCouncil.members).toEqual([]);
    expect(decision.continuity.fingerprintFields).toEqual([]);
    expect(decision.continuity.cookieFields).toEqual([]);
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
    expect(decision.contentFoundry.continuity.fingerprintContract).toBe(
      FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT,
    );
    expect(decision.contentFoundry.continuity.cookieContract).toBe(
      FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT,
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
