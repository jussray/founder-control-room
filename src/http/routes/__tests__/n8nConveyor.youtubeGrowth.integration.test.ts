import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import {
  CONTENT_LANE_SYSTEM_CONTRACT,
} from '../../../lib/contentLaneSystem.js';
import { FIRST_PARTY_SOCIAL_PLATFORMS } from '../../../lib/firstPartySocialPublisher.js';
import {
  YOUTUBE_CHANNEL_SYSTEM,
  YOUTUBE_GROWTH_EVALUATION_CONTRACT,
} from '../youtubeGrowth.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const NOW = '2026-09-19T20:00:00.000Z';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/automation/conveyor', n8nConveyorRouter);
  return app;
}

function measurement() {
  return {
    observedAt: '2026-09-19T19:00:00.000Z',
    source: 'youtube-native',
    evidenceRefs: ['youtube:video:abc123'],
    metrics: {
      impressions: 10_000,
      views: 900,
      ctrPercent: 7,
      retentionPercent: 52,
      watchTimeMinutes: 4_200,
    },
  };
}

function winner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'experiment-a',
    confirmedRunEvidenceRefs: ['youtube:run:1'],
    criteria: [
      { metric: 'ctrPercent', minimum: 5 },
      { metric: 'retentionPercent', minimum: 40 },
    ],
    measurement: measurement(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { email: FOUNDER_EMAIL },
          error: null,
        }),
      }),
    }),
  }));
});

describe('authenticated YouTube growth evaluation route', () => {
  it('does not expose the evaluator without a founder session', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .send({});

    expect(res.status).toBe(401);
  });

  it('advertises the existing channel system without creating a second content OS or mutation authority', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor/founder-content/youtube-growth')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      contract: YOUTUBE_GROWTH_EVALUATION_CONTRACT,
      route: '/automation/conveyor/founder-content/youtube-growth/evaluate',
      phases: ['TEST_AND_VALIDATE', 'DOUBLE_DOWN', 'SCALE'],
      channelSystem: YOUTUBE_CHANNEL_SYSTEM,
      authority: {
        advisoryOnly: true,
        publish: false,
        schedule: false,
        spend: false,
        scaleExecution: false,
        merge: false,
        deploy: false,
      },
    }));
    expect(res.body.channelSystem.sequence).toEqual([
      'audience-problem-promise',
      'repeatable-format',
      'content-engine',
      'return-loop',
      'money-path',
      'measure-compound-or-kill',
    ]);
    expect(res.body.channelSystem.pillars).toEqual(['DISCOVER', 'PROVE', 'BELONG', 'CONVERT']);
    expect(res.body.channelSystem.contentUnit).toEqual(['HOOK', 'VALUE', 'PROOF', 'PAYOFF', 'CTA']);
    expect(res.body.channelSystem.faceless).toEqual(expect.objectContaining({
      allowed: true,
      originalValueRequired: true,
      copiedOrReusedContentIsStrategy: false,
      faceNotRequiredButPointOfViewIsRequired: true,
    }));
    expect(res.body.channelSystem.monetization).toEqual(expect.objectContaining({
      directMoneyPathDesignedEarly: true,
      platformAdsAreBonus: true,
      platformEligibilityRequiresProviderEvidence: true,
      visibilityIsNotRevenue: true,
      revenueRequiresOutcomeEvidence: true,
    }));
    expect(res.body.channelSystem.lane).toEqual(expect.objectContaining({
      platform: 'youtube',
      laneId: 'content-youtube',
      northStar: expect.objectContaining({
        id: 'returning-viewer-watchtime-to-qualified-action',
      }),
    }));
  });

  it('exposes one governed content lane for every existing first-party platform', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor/founder-content/youtube-growth')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.contentLaneSystem).toEqual(expect.objectContaining({
      contract: CONTENT_LANE_SYSTEM_CONTRACT,
      shared: expect.objectContaining({
        pillars: ['DISCOVER', 'PROVE', 'BELONG', 'CONVERT'],
        contentUnit: ['HOOK', 'VALUE', 'PROOF', 'PAYOFF', 'CTA'],
        learning: expect.objectContaining({
          promoteOnlyOnLaneNorthStarOutcomeEvidence: true,
          missesRemainRevisionMemory: true,
        }),
      }),
      authority: {
        advisoryOnly: true,
        authorizesPublish: false,
        authorizesSchedule: false,
        authorizesSpend: false,
        authorizesScaleExecution: false,
      },
    }));

    const lanes = res.body.contentLaneSystem.lanes;
    expect(lanes).toHaveLength(FIRST_PARTY_SOCIAL_PLATFORMS.length);
    expect(lanes.map((lane: { platform: string }) => lane.platform).sort())
      .toEqual([...FIRST_PARTY_SOCIAL_PLATFORMS].sort());
    expect(new Set(lanes.map((lane: { northStar: { id: string } }) => lane.northStar.id)).size)
      .toBe(FIRST_PARTY_SOCIAL_PLATFORMS.length);
  });

  it('rejects malformed experiment evidence before core evaluation', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .set('Authorization', BEARER)
      .send({
        day: 31,
        evaluatedAt: NOW,
        currentPhase: 'TEST_AND_VALIDATE',
        requestedPhase: 'DOUBLE_DOWN',
        experiments: [winner({ confirmedRunEvidenceRefs: 'not-an-array' })],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'INVALID_YOUTUBE_GROWTH_EVALUATION_PAYLOAD',
      contract: YOUTUBE_GROWTH_EVALUATION_CONTRACT,
    }));
  });

  it('rejects malformed continuity and unknown target fields instead of crashing or leaking them', async () => {
    const malformedContinuity = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .set('Authorization', BEARER)
      .send({
        day: 31,
        evaluatedAt: NOW,
        currentPhase: 'TEST_AND_VALIDATE',
        requestedPhase: 'DOUBLE_DOWN',
        experiments: [winner()],
        continuity: { currentFingerprint: 123 },
      });

    expect(malformedContinuity.status).toBe(400);
    expect(malformedContinuity.body.code).toBe('INVALID_YOUTUBE_GROWTH_EVALUATION_PAYLOAD');

    const unknownTarget = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .set('Authorization', BEARER)
      .send({
        day: 31,
        evaluatedAt: NOW,
        currentPhase: 'TEST_AND_VALIDATE',
        requestedPhase: 'DOUBLE_DOWN',
        experiments: [winner()],
        targets: { views: 1_000, publishAuthority: 1 },
      });

    expect(unknownTarget.status).toBe(400);
    expect(unknownTarget.body.code).toBe('INVALID_YOUTUBE_GROWTH_EVALUATION_PAYLOAD');
  });

  it('makes a fresh sourced Day-31 winner reachable without granting execution authority', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .set('Authorization', BEARER)
      .send({
        day: 31,
        evaluatedAt: NOW,
        currentPhase: 'TEST_AND_VALIDATE',
        requestedPhase: 'DOUBLE_DOWN',
        experiments: [winner()],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.channelSystem).toEqual(YOUTUBE_CHANNEL_SYSTEM);
    expect(res.body.published).toBe(false);
    expect(res.body.providerMutationAttempted).toBe(false);
    expect(res.body.result).toEqual(expect.objectContaining({
      transition: 'ADVANCE',
      phase: 'DOUBLE_DOWN',
      winningExperimentIds: ['experiment-a'],
      authority: {
        advisoryOnly: true,
        authorizesPublish: false,
        authorizesSchedule: false,
        authorizesSpend: false,
        authorizesScaleExecution: false,
        targetsAreOutcomeEvidence: false,
        continuityMarkersAuthorize: false,
      },
    }));
  });

  it('cannot fake Day-61 repeatability with a duplicated receipt', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/youtube-growth/evaluate')
      .set('Authorization', BEARER)
      .send({
        day: 61,
        evaluatedAt: NOW,
        currentPhase: 'DOUBLE_DOWN',
        requestedPhase: 'SCALE',
        experiments: [winner({
          confirmedRunEvidenceRefs: ['youtube:run:1', 'youtube:run:1'],
        })],
      });

    expect(res.status).toBe(200);
    expect(res.body.result.transition).toBe('HOLD');
    expect(res.body.result.reasons).toContain('no_repeatable_winner');
    expect(res.body.result.repeatableWinningExperimentIds).toEqual([]);
    expect(res.body.result.experimentFailures).toContainEqual({
      experimentId: 'experiment-a',
      reasons: ['repeatability_missing_evidence'],
    });
  });
});