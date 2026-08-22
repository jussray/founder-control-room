import { describe, expect, it } from 'vitest';
import {
  addEvidence,
  advanceProspect,
  assertQuickScanTransition,
  createOverrideReceipt,
  createProspect,
  setChiefRecommendation,
} from '../engine.js';
import type { PromptWorkflowReference } from '../contracts.js';

const SEGMENT = 'salon_studio_team_owner' as const;

function scoredProspect() {
  const prospect = createProspect({ businessName: 'Example Studio', segment: SEGMENT });
  for (const category of ['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency'] as const) {
    addEvidence(prospect, { category, note: `Observed ${category}` }, 'founder');
  }
  return prospect;
}

describe('QuickScan engine', () => {
  it('scores observable evidence to 10 without demographic shortcuts', () => {
    const prospect = scoredProspect();
    expect(prospect.score.total).toBe(10);
    expect(createProspect({ businessName: 'Beauty Account', segment: SEGMENT }).score.total).toBe(0);
  });

  it('rejects contacted -> paid even when qualification might exist elsewhere', () => {
    expect(() => assertQuickScanTransition('contacted', 'paid')).toThrow('Invalid QuickScan lifecycle transition');
  });

  it('requires auditable evidence-bound overrides and limits overrideable transitions', () => {
    const prospect = scoredProspect();
    advanceProspect(prospect, 'researched', 'founder');
    const receipt = createOverrideReceipt({
      actor: 'founder@example.com',
      reason: 'Founder reviewed exact observed evidence.',
      from: 'researched',
      to: 'qualified_for_outreach',
      evidenceIds: prospect.score.evidenceIds,
    });
    expect(advanceProspect(prospect, 'qualified_for_outreach', 'founder', receipt).overrideReceipts).toHaveLength(1);
    expect(() => createOverrideReceipt({ actor: 'founder', reason: 'skip', from: 'contacted', to: 'paid', evidenceIds: ['e1'] })).toThrow('override is not permitted');
  });

  it('binds Chief output to the exact PromptOS-selected workflow reference', () => {
    const prospect = scoredProspect();
    const selected: PromptWorkflowReference = { workflowId: 'quickscan-outreach', workflowVersion: '1', promptId: 'pain-first', promptVersion: '2' };
    setChiefRecommendation(prospect, {
      summary: 'High-priority observable pain.',
      nextAction: 'approve_outreach',
      messageDraft: 'Question-first draft',
      promptWorkflow: selected,
    }, selected);
    expect(prospect.chiefRecommendation?.promptWorkflow.promptVersion).toBe('2');

    expect(() => setChiefRecommendation(prospect, {
      summary: 'Mismatch', nextAction: 'approve_outreach', promptWorkflow: { ...selected, promptVersion: '3' },
    }, selected)).toThrow('provenance');
  });
});
