import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOURCE,
  buildFounderSignalModel,
} from '../../../public/control-room/founder-signal-engine-model.js';

const invocationId = '11111111-1111-4111-8111-111111111111';

function event(event_type, metadata = {}, created_at = '2026-07-25T05:00:00.000Z') {
  return {
    event_type,
    metadata: {
      invocationId,
      sourceRepository: DEFAULT_SOURCE.repository,
      sourceCommitSha: DEFAULT_SOURCE.commit,
      ...metadata,
    },
    created_at,
  };
}

describe('Founder Signal Engine operator evidence model', () => {
  it('does not treat requested action names or HubSpot permission flags as proof', () => {
    const model = buildFounderSignalModel([
      event('founder_signal_engine_bridge_requested', {
        requestedAction: 'run_openai_step',
        allowHubSpotWrite: true,
      }),
    ]);

    expect(model.stages.find((stage) => stage.id === 'bridge')?.status).toBe('complete');
    expect(model.stages.find((stage) => stage.id === 'openai')?.status).toBe('pending');
    expect(model.stages.find((stage) => stage.id === 'hubspot')?.status).toBe('pending');
    expect(model.complete).toBe(false);
  });

  it('marks only Zapier complete when an accepted receipt contains a run ID', () => {
    const model = buildFounderSignalModel([
      event('founder_signal_engine_bridge_requested'),
      event('founder_signal_engine_bridge_accepted', { zapierRunId: 'run-599' }),
    ]);

    expect(model.runId).toBe('run-599');
    expect(model.stages.find((stage) => stage.id === 'zapier')?.status).toBe('complete');
    expect(model.stages.find((stage) => stage.id === 'openai')?.status).toBe('pending');
    expect(model.stages.find((stage) => stage.id === 'buffer')?.status).toBe('pending');
    expect(model.stages.find((stage) => stage.id === 'hubspot')?.status).toBe('pending');
    expect(model.stages.find((stage) => stage.id === 'control-room')?.status).toBe('pending');
  });

  it('requires explicit downstream proof events before Day 3 can pass', () => {
    const model = buildFounderSignalModel([
      event('founder_signal_engine_bridge_requested'),
      event('founder_signal_engine_bridge_accepted', { zapierRunId: 'run-599' }),
      event('founder_signal_engine_openai_output_recorded', { openAiArtifactVerified: true }),
      event('founder_signal_engine_buffer_artifact_recorded', { bufferArtifactVerified: true }),
      event('founder_signal_engine_hubspot_association_recorded', { hubSpotEvidenceVerified: true }),
      event('founder_signal_engine_end_to_end_proof_complete', { endToEndProofComplete: true }),
    ]);

    expect(model.complete).toBe(true);
    expect(model.firstBlocker).toBeNull();
    expect(model.stages.every((stage) => stage.status === 'complete')).toBe(true);
    expect(model.source).toEqual(DEFAULT_SOURCE);
  });

  it('anchors the dashboard to the newest matching bridge request, not a later old artifact', () => {
    const oldInvocation = '22222222-2222-4222-8222-222222222222';
    const model = buildFounderSignalModel([
      event('founder_signal_engine_bridge_requested', {}, '2026-07-25T05:00:00.000Z'),
      {
        event_type: 'founder_signal_engine_openai_output_recorded',
        metadata: {
          invocationId: oldInvocation,
          sourceRepository: DEFAULT_SOURCE.repository,
          sourceCommitSha: DEFAULT_SOURCE.commit,
          openAiArtifactVerified: true,
        },
        created_at: '2026-07-25T06:00:00.000Z',
      },
    ]);

    expect(model.invocationId).toBe(invocationId);
    expect(model.stages.find((stage) => stage.id === 'openai')?.status).toBe('pending');
  });

  it('ignores bridge requests for a different source commit', () => {
    const model = buildFounderSignalModel([
      event('founder_signal_engine_bridge_requested', {
        sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ]);

    expect(model.invocationId).toBeNull();
    expect(model.stages.find((stage) => stage.id === 'bridge')?.status).toBe('pending');
  });
});
