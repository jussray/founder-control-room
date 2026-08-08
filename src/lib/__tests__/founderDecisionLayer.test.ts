import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateFounderFinalDecision,
  type FounderFinalDecisionInput,
} from '../founderDecisionLayer.js';
import {
  FOUNDER_RESEARCH_SUMMARY_CONTRACT,
  founderResearchSummaryId,
  validateFounderResearchSummary,
  type FounderResearchSummaryEnvelope,
} from '../founderResearchSummary.js';
import { expectedFounderConveyorReceiptId } from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);
const scriptPath = path.resolve(process.cwd(), 'scripts/research_summary.py');

function pythonSummary(overrides: Record<string, unknown> = {}): FounderResearchSummaryEnvelope {
  const raw = {
    runId: 'run-123',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    scriptVersion: 'research-summary.py@v1',
    generatedAt: '2026-08-08T03:45:00Z',
    sources: [
      { url: 'https://docs.github.com/actions', title: 'GitHub Actions docs' },
      { url: 'https://docs.n8n.io/', title: 'n8n docs' },
    ],
    claims: ['Exact-head proof is required.', 'Receipts must be deterministic.'],
    contradictions: [],
    confidence: 0.91,
    recommendation: 'Keep activation blocked until proof agrees.',
    ...overrides,
  };
  const result = spawnSync('python3', [scriptPath], {
    input: JSON.stringify(raw),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'python research summary failed');
  return JSON.parse(result.stdout) as FounderResearchSummaryEnvelope;
}

function candidate(summary: FounderResearchSummaryEnvelope): FounderFinalDecisionInput {
  const transition = {
    runId: 'run-123',
    projectSlug: 'founder-control-room',
    goal: 'Advance one verified founder workflow stage.',
    fromStage: 'workflows' as const,
    toStage: 'code' as const,
    expectedHeadSha: SHA,
    evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/'.concat(SHA)],
  };
  return {
    ...transition,
    n8nReceiptId: expectedFounderConveyorReceiptId(transition),
    githubProof: {
      status: 'green',
      expectedHeadSha: SHA,
      proofUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    },
    pythonSummaries: [summary],
    researchRequired: true,
    llmSynthesis: {
      status: 'supports',
      confidence: 0.9,
      contradictions: [],
    },
  };
}

describe('founder final decision layer', () => {
  it('keeps Python and TypeScript summary identity in parity', () => {
    const summary = pythonSummary();
    expect(summary.contract).toBe(FOUNDER_RESEARCH_SUMMARY_CONTRACT);
    expect(validateFounderResearchSummary(summary)).toEqual([]);
    expect(summary.summaryId).toBe(founderResearchSummaryId(summary));
  });

  it('approves only a fully proof-backed evidence packet and records Python summary IDs', () => {
    const summary = pythonSummary();
    const result = evaluateFounderFinalDecision(candidate(summary));
    expect(result.decision).toBe('APPROVE');
    expect(result.pythonSummaryIds).toEqual([summary.summaryId]);
    expect(result.decisionId).toMatch(/^fcr-final-decision-v1:[0-9a-f]{64}$/);
    expect(result.authority).toEqual({
      advanceStage: false,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    });
  });

  it('fails closed when Python research contains unresolved contradictions', () => {
    const summary = pythonSummary({ contradictions: ['GitHub and provider state disagree.'] });
    const result = evaluateFounderFinalDecision(candidate(summary));
    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('python research contains unresolved contradictions');
  });

  it('needs proof when research is required but no Python summary is present', () => {
    const summary = pythonSummary();
    const input = candidate(summary);
    input.pythonSummaries = [];
    const result = evaluateFounderFinalDecision(input);
    expect(result.decision).toBe('NEEDS_PROOF');
  });

  it('blocks receipt drift instead of averaging it into confidence', () => {
    const summary = pythonSummary();
    const input = candidate(summary);
    input.n8nReceiptId = `fcr-conveyor-receipt-v2:${'0'.repeat(64)}`;
    const result = evaluateFounderFinalDecision(input);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('n8n receipt does not match the canonical v2 transition identity');
  });
});
