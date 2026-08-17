import { describe, expect, it } from 'vitest';
import { buildMissionControlBrief } from './missionControl.js';

const NOW = new Date('2026-07-24T20:00:00.000Z');
const project = { slug: 'founder-control-room', name: 'Founder Control Room' };

function mission(overrides: Partial<Parameters<typeof buildMissionControlBrief>[0]['missions'][number]> = {}) {
  return {
    id: 'mission-1',
    project_id: 'project-1',
    title: 'Ship verified Mission Control',
    description: null,
    status: 'proposed',
    risk_level: 'medium',
    updated_at: '2026-07-24T18:00:00.000Z',
    project,
    ...overrides,
  };
}

describe('FutureYou V8 mission control', () => {
  it('ranks rollback and critical evidence above ordinary proposed work', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [
        mission(),
        mission({ id: 'rollback', title: 'Recover failed deployment', status: 'rolled_back', risk_level: 'high' }),
      ],
      activity: [
        {
          id: 'critical-event',
          project_id: 'project-1',
          event_type: 'payment_delivery_failed',
          severity: 'critical',
          screen: 'provider-webhook',
          metadata: { provider: 'example' },
          created_at: '2026-07-24T19:00:00.000Z',
          project,
        },
      ],
    });

    expect(brief.priorities[0].source).toBe('mission');
    expect(brief.priorities[0].title).toBe('Recover failed deployment');
    expect(brief.priorities[1].source).toBe('event');
    expect(brief.priorities.at(-1)?.title).toBe('Ship verified Mission Control');
  });

  it('keeps approved execution explicitly gated at L4', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [mission({ status: 'approved' })],
      activity: [],
    });

    expect(brief.priorities[0].authority).toMatchObject({
      level: 'L4',
      requiresExplicitApproval: true,
    });
    expect(brief.priorities[0].authority.boundary).toContain('cannot perform');
  });

  it('does not invent financial value or conversion probability', () => {
    const brief = buildMissionControlBrief({ now: NOW, missions: [mission()], activity: [] });
    const serialized = JSON.stringify(brief);

    expect(serialized).not.toContain('expectedValue');
    expect(serialized).not.toContain('conversionProbability');
    expect(brief.blindSpots).toContain(
      'No verified revenue or expected-value feed is connected to this read model; rankings are operational, not financial forecasts.',
    );
  });

  it('keeps structural evidence separate from observation trust', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [mission({ project: null })],
      activity: [],
    });

    expect(brief.summary.evidenceCoveragePercent).toBe(100);
    expect(brief.summary.trustedObservationPercent).toBe(100);
    expect(brief.blindSpots).toContain('Some records are missing project labels, lowering prioritization confidence.');
    expect(brief.priorities[0].confidence).toBe('medium');
    expect(brief.priorities[0].observationState).toBe('fresh');
  });

  it('forces malformed observation times to low confidence instead of treating them as fresh', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [mission({ updated_at: 'not-a-timestamp' })],
      activity: [],
    });

    expect(brief.summary.evidenceCoveragePercent).toBe(100);
    expect(brief.summary.trustedObservationPercent).toBe(0);
    expect(brief.summary.invalidObservationTimes).toBe(1);
    expect(brief.priorities[0]).toMatchObject({
      observationState: 'invalid',
      confidence: 'low',
    });
    expect(brief.priorities[0].reason).toContain('invalid observation time');
    expect(brief.blindSpots.some((item) => item.includes('invalid observation time'))).toBe(true);
  });

  it('rejects future-dated observations as trusted evidence beyond bounded clock skew', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [mission({ updated_at: '2026-07-25T20:00:00.000Z' })],
      activity: [],
    });

    expect(brief.summary.trustedObservationPercent).toBe(0);
    expect(brief.summary.futureObservationTimes).toBe(1);
    expect(brief.priorities[0]).toMatchObject({
      observationState: 'future',
      confidence: 'low',
    });
    expect(brief.priorities[0].reason).toContain('future-dated observation');
  });

  it('does not count malformed or future timestamps as recent completions', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [
        mission({ id: 'invalid-completion', status: 'deployed', updated_at: 'broken' }),
        mission({ id: 'future-completion', status: 'integrated', updated_at: '2026-07-25T20:00:00.000Z' }),
        mission({ id: 'real-completion', status: 'deployed', updated_at: '2026-07-24T19:00:00.000Z' }),
      ],
      activity: [],
    });

    expect(brief.summary.recentCompletions).toBe(1);
    expect(brief.summary.invalidObservationTimes).toBe(1);
    expect(brief.summary.futureObservationTimes).toBe(1);
    expect(brief.summary.trustedObservationPercent).toBe(33);
  });

  it('marks three-day-old observations stale and exposes the analytical gap', () => {
    const brief = buildMissionControlBrief({
      now: NOW,
      missions: [mission({ updated_at: '2026-07-20T20:00:00.000Z' })],
      activity: [],
    });

    expect(brief.summary.staleObservations).toBe(1);
    expect(brief.summary.trustedObservationPercent).toBe(0);
    expect(brief.priorities[0]).toMatchObject({
      observationState: 'stale',
      confidence: 'medium',
    });
    expect(brief.blindSpots.some((item) => item.includes('cannot count as fresh decision evidence'))).toBe(true);
  });
});
