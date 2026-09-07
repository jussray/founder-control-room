import { describe, expect, it, vi } from 'vitest';
import { createOpenAiMirrorRunner } from '../../mirror/openaiClient.js';
import type { MirrorRunInput } from '../../mirror/types.js';
import { createOpenAiQuickScanChiefRunner } from '../../quickscan/chiefOpenaiClient.js';
import type { QuickScanChiefPromptInput } from '../../quickscan/chiefPrompts.js';

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const mirrorInput: MirrorRunInput = {
  transcript: 'Keep the build moving with one bounded proof step.',
  relatedMemories: [],
  timeEnergyContext: 'Ten minutes available.',
  recipientContext: null,
  voiceProfile: null,
};

const mirrorOutput = {
  headline: 'Move the build one proof step',
  summary: 'Keep the next move bounded and verifiable.',
  intent_tags: ['build'],
  action_text: 'Review the exact provider receipt.',
  script: null,
  time_estimate_minutes: 5,
  goal: 'build',
  confidence: 0.8,
  tone_guarded_script: null,
  contains_external_factual_claims: false,
  factual_claims: [],
};

const quickScanInput: QuickScanChiefPromptInput = {
  businessName: 'Glow Studio',
  ownerName: 'Maya',
  segment: 'salon_studio_team_owner',
  lifecycleState: 'draft_ready',
  score: {
    visibleFriction: 2,
    activeDemand: 2,
    ownerReachable: 1,
    repeatHighValue: 2,
    operationalComplexity: 1,
    urgency: 2,
    total: 10,
    evidenceIds: ['e1'],
    humanApproved: false,
  },
  evidence: [{
    id: 'e1',
    category: 'visible_friction',
    note: 'Customers ask about availability in comments.',
    observedAt: new Date().toISOString(),
  }],
  qualification: null,
};

describe('product provider integration', () => {
  it('runs Mirror through Anthropic while preserving local validation and evidence-specific retention provenance', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      const schemaText = JSON.stringify(body.output_config.format.schema);
      expect(schemaText).not.toContain('minLength');
      expect(schemaText).not.toContain('maxLength');
      expect(schemaText).not.toContain('minimum');
      expect(schemaText).not.toContain('maximum');
      expect(schemaText).not.toContain('maxItems');
      expect(schemaText).not.toContain('uniqueItems');
      return fakeResponse({
        id: 'msg_mirror_1',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(mirrorOutput) }],
      });
    });

    const runner = createOpenAiMirrorRunner({
      env: {
        MIRROR_ENGINE_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'anthropic-test',
        MIRROR_ENGINE_ANTHROPIC_MODEL: 'claude-test',
      },
      fetchFn,
    });

    const result = await runner(mirrorInput);
    expect(result.provenance).toMatchObject({
      provider: 'anthropic',
      model: 'claude-test',
      responseId: 'msg_mirror_1',
      storedByProvider: null,
    });
    expect(result.output.goal).toBe('build');
  });

  it('falls back from a retryable OpenAI failure to configured Anthropic without changing the Mirror contract', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ error: { message: 'temporary outage' } }, 503))
      .mockResolvedValueOnce(fakeResponse({
        id: 'msg_mirror_fallback',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(mirrorOutput) }],
      }));

    const runner = createOpenAiMirrorRunner({
      env: {
        OPENAI_API_KEY: 'openai-test',
        MIRROR_ENGINE_FALLBACK_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'anthropic-test',
        MIRROR_ENGINE_ANTHROPIC_MODEL: 'claude-test',
      },
      fetchFn,
    });

    const result = await runner(mirrorInput);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.provenance.provider).toBe('anthropic');
    expect(result.output.actionText).toBe('Review the exact provider receipt.');
  });

  it('fails closed when Anthropic is selected without both its key and explicit model', async () => {
    const runner = createOpenAiMirrorRunner({
      env: { MIRROR_ENGINE_PROVIDER: 'anthropic' },
      fetchFn: vi.fn(),
    });

    await expect(runner(mirrorInput)).rejects.toMatchObject({
      code: 'ANTHROPIC_NOT_CONFIGURED',
    });
  });

  it('runs QuickScan Chief through Anthropic while preserving the canonical PromptOS workflow stamp', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({
      id: 'msg_quickscan_1',
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary: 'Evidence is still too thin for outreach.',
          next_action: 'capture_more_evidence',
          message_draft: null,
        }),
      }],
    }));

    const runner = createOpenAiQuickScanChiefRunner({
      env: {
        QUICKSCAN_CHIEF_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'anthropic-test',
        QUICKSCAN_CHIEF_ANTHROPIC_MODEL: 'claude-test',
      },
      fetchFn,
    });

    const result = await runner(quickScanInput);
    expect(result.provenance).toMatchObject({
      provider: 'anthropic',
      model: 'claude-test',
      responseId: 'msg_quickscan_1',
    });
    expect(result.recommendation).toMatchObject({
      nextAction: 'capture_more_evidence',
      promptWorkflow: {
        workflowId: 'quickscan-outreach-v1',
        workflowVersion: '1',
        promptId: 'quickscan-next-action-v1',
        promptVersion: '1',
      },
    });
  });
});
