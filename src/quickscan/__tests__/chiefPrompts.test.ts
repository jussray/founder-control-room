import { describe, expect, it } from 'vitest';
import {
  QUICKSCAN_CHIEF_PROMPT_VERSION,
  QUICKSCAN_CHIEF_SYSTEM_PROMPT,
  QUICKSCAN_CHIEF_WORKFLOW,
} from '../chiefPrompts.js';

const NEGOTIATION_CHAIN = 'DISCOVER -> GOAL -> AUTHORITY -> BATNA -> VALUE -> EVIDENCE -> STRUCTURE -> TERMS -> RECEIPT';

describe('QuickScan outreach negotiation contract', () => {
  it('keeps discovery, authority, leverage, structure, terms, and receipts in the model prompt', () => {
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain(NEGOTIATION_CHAIN);
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('DISCOVER first');
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('Never assume buying authority');
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('Never invent competing offers, deadlines, demand, or scarcity');
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('STRUCTURE before TERMS');
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('Never lie, omit required disclosures, or create a false impression');
    expect(QUICKSCAN_CHIEF_SYSTEM_PROMPT).toContain('observable next step or question');
  });

  it('versions the workflow when negotiation behavior changes', () => {
    expect(QUICKSCAN_CHIEF_PROMPT_VERSION).toBe('quickscan-chief-v2-2026-10-05-negotiation');
    expect(QUICKSCAN_CHIEF_WORKFLOW).toMatchObject({
      workflowId: 'quickscan-outreach-v1',
      promptId: 'quickscan-next-action-v1',
      promptVersion: '2',
    });
  });
});
