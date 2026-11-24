import { describe, expect, it } from 'vitest';
import {
  CONTENT_LANES,
  CONTENT_LANE_SHARED_SYSTEM,
  CONTENT_LANE_SYSTEM_CONTRACT,
  contentLaneSystemSnapshot,
  getContentLane,
  listContentLanes,
} from '../contentLaneSystem.js';
import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  FIRST_PARTY_SOCIAL_PLATFORMS,
} from '../firstPartySocialPublisher.js';

describe('content lane system', () => {
  it('creates exactly one lane for every first-party content platform', () => {
    expect(Object.keys(CONTENT_LANES).sort()).toEqual([...FIRST_PARTY_SOCIAL_PLATFORMS].sort());
    expect(listContentLanes()).toHaveLength(FIRST_PARTY_SOCIAL_PLATFORMS.length);
  });

  it.each(FIRST_PARTY_SOCIAL_PLATFORMS)(
    'gives %s the same core engine plus its own lane north star and native shape',
    (platform) => {
      const lane = getContentLane(platform);
      const capability = FIRST_PARTY_PLATFORM_CAPABILITIES[platform];

      expect(lane.contract).toBe(CONTENT_LANE_SYSTEM_CONTRACT);
      expect(lane.platform).toBe(platform);
      expect(lane.laneId).toBe(`content-${platform.replace('_', '-')}`);
      expect(lane.northStar.id.length).toBeGreaterThan(5);
      expect(lane.northStar.outcome.length).toBeGreaterThan(20);
      expect(lane.northStar.evidenceSignals.length).toBeGreaterThanOrEqual(4);
      expect(lane.nativeFormats.length).toBeGreaterThanOrEqual(2);
      expect(lane.discoveryMechanics.length).toBeGreaterThanOrEqual(3);
      expect(lane.returnMechanics.length).toBeGreaterThanOrEqual(3);
      expect(lane.conversionPaths.length).toBeGreaterThanOrEqual(3);
      expect(lane.proofPreference.length).toBeGreaterThanOrEqual(3);
      expect(lane.publication).toEqual({
        contentField: capability.contentField,
        adapterReadiness: capability.adapterReadiness,
        requiresMedia: capability.requiresMedia,
        accountBoundary: capability.accountBoundary,
      });
      expect(lane.authority).toEqual({
        advisoryOnly: true,
        authorizesPublish: false,
        authorizesSchedule: false,
        authorizesSpend: false,
        authorizesScaleExecution: false,
      });
    },
  );

  it('keeps the proven content mechanics shared instead of cloning eleven separate engines', () => {
    expect(CONTENT_LANE_SHARED_SYSTEM.sequence).toEqual([
      'audience-problem-promise',
      'repeatable-format',
      'content-engine',
      'return-loop',
      'money-path',
      'measure-compound-or-kill',
    ]);
    expect(CONTENT_LANE_SHARED_SYSTEM.pillars).toEqual(['DISCOVER', 'PROVE', 'BELONG', 'CONVERT']);
    expect(CONTENT_LANE_SHARED_SYSTEM.contentUnit).toEqual(['HOOK', 'VALUE', 'PROOF', 'PAYOFF', 'CTA']);
    expect(CONTENT_LANE_SHARED_SYSTEM.learning).toEqual(expect.objectContaining({
      promoteOnlyOnLaneNorthStarOutcomeEvidence: true,
      repeatabilityRequiresDistinctRunReceipts: true,
      missesRemainRevisionMemory: true,
      oneSpikeDoesNotProveRepeatability: true,
    }));
  });

  it('does not let lane definitions mint publication, scheduling, spending, or scaling authority', () => {
    const snapshot = contentLaneSystemSnapshot();
    expect(snapshot.authority).toEqual({
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      authorizesScaleExecution: false,
    });
    for (const lane of snapshot.lanes) {
      expect(lane.authority.authorizesPublish).toBe(false);
      expect(lane.authority.authorizesSchedule).toBe(false);
      expect(lane.authority.authorizesSpend).toBe(false);
      expect(lane.authority.authorizesScaleExecution).toBe(false);
    }
  });

  it('keeps each platform north star distinct so success is lane-specific', () => {
    const ids = listContentLanes().map((lane) => lane.northStar.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
