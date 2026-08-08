import { createHash } from 'node:crypto';
import {
  expectedFounderConveyorReceiptId,
  type FounderConveyorAdvanceInput,
} from './n8nConveyor.js';
import {
  validateFounderResearchSummary,
  type FounderResearchSummaryEnvelope,
} from './founderResearchSummary.js';

export const FOUNDER_FINAL_DECISION_CONTRACT = 'founder-control-room/final-decision@v1' as const;
export const FOUNDER_FINAL_DECISION_PREFIX = 'fcr-final-decision-v1:' as const;

export type FounderFinalDecision = 'APPROVE' | 'BLOCK' | 'NEEDS_PROOF' | 'RETRY';

export interface FounderGithubProof {
  status: 'green' | 'red' | 'unknown';
  expectedHeadSha: string;
  proofUrls: string[];
}

export interface FounderLlmSynthesis {
  status: 'supports' | 'contradicts' | 'unknown';
  confidence: number;
  contradictions: string[];
}

export interface FounderFinalDecisionInput extends FounderConveyorAdvanceInput {
  n8nReceiptId: string | null;
  githubProof: FounderGithubProof;
  pythonSummaries: FounderResearchSummaryEnvelope[];
  researchRequired: boolean;
  llmSynthesis: FounderLlmSynthesis;
  retryableFailure?: boolean;
}

export interface FounderFinalDecisionReceipt {
  decisionId: string;
  contract: typeof FOUNDER_FINAL_DECISION_CONTRACT;
  decision: FounderFinalDecision;
  runId: string;
  projectSlug: string;
  expectedHeadSha: string;
  fromStage: string;
  toStage: string;
  n8nReceiptId: string | null;
  pythonSummaryIds: string[];
  githubProofUrls: string[];
  reasons: string[];
  authority: {
    advanceStage: false;
    merge: false;
    deploy: false;
    publish: false;
    sendExternal: false;
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function decisionId(receipt: Omit<FounderFinalDecisionReceipt, 'decisionId'>): string {
  const seed = JSON.stringify([
    receipt.contract,
    receipt.decision,
    receipt.runId,
    receipt.projectSlug,
    receipt.expectedHeadSha,
    receipt.fromStage,
    receipt.toStage,
    receipt.n8nReceiptId,
    receipt.pythonSummaryIds,
    receipt.githubProofUrls,
    receipt.reasons,
  ]);
  return `${FOUNDER_FINAL_DECISION_PREFIX}${createHash('sha256').update(seed).digest('hex')}`;
}

export function evaluateFounderFinalDecision(input: FounderFinalDecisionInput): FounderFinalDecisionReceipt {
  const reasons: string[] = [];
  let decision: FounderFinalDecision = 'APPROVE';
  const expectedSha = input.expectedHeadSha.trim().toLowerCase();
  const expectedReceiptId = expectedFounderConveyorReceiptId(input);

  if (input.retryableFailure) {
    decision = 'RETRY';
    reasons.push('runtime reported a retryable failure');
  }

  if (input.githubProof.expectedHeadSha.trim().toLowerCase() !== expectedSha) {
    decision = 'BLOCK';
    reasons.push('GitHub proof SHA does not match the requested exact head');
  } else if (input.githubProof.status === 'red') {
    decision = 'BLOCK';
    reasons.push('GitHub exact-head proof is red');
  } else if (input.githubProof.status === 'unknown') {
    decision = 'NEEDS_PROOF';
    reasons.push('GitHub exact-head proof is unknown');
  }

  if (!input.n8nReceiptId && decision !== 'BLOCK') {
    decision = 'NEEDS_PROOF';
    reasons.push('n8n receipt is missing');
  } else if (input.n8nReceiptId && input.n8nReceiptId !== expectedReceiptId) {
    decision = 'BLOCK';
    reasons.push('n8n receipt does not match the canonical v2 transition identity');
  }

  if (input.researchRequired && input.pythonSummaries.length === 0 && decision !== 'BLOCK') {
    decision = 'NEEDS_PROOF';
    reasons.push('research summary is required for this decision');
  }

  for (const summary of input.pythonSummaries) {
    const validation = validateFounderResearchSummary(summary);
    if (validation.length > 0) {
      decision = 'BLOCK';
      reasons.push(...validation.map((reason) => `python summary rejected: ${reason}`));
      continue;
    }
    if (summary.runId !== input.runId.trim()) {
      decision = 'BLOCK';
      reasons.push('python summary runId does not match the decision run');
    }
    if (summary.projectSlug !== input.projectSlug.trim()) {
      decision = 'BLOCK';
      reasons.push('python summary projectSlug does not match the decision project');
    }
    if (summary.expectedHeadSha.toLowerCase() !== expectedSha) {
      decision = 'BLOCK';
      reasons.push('python summary SHA does not match the requested exact head');
    }
    if (summary.contradictions.length > 0) {
      decision = 'BLOCK';
      reasons.push('python research contains unresolved contradictions');
    }
  }

  if (input.llmSynthesis.contradictions.length > 0 || input.llmSynthesis.status === 'contradicts') {
    decision = 'BLOCK';
    reasons.push('LLM synthesis contradicts the current evidence packet');
  } else if (input.llmSynthesis.status === 'unknown' && decision !== 'BLOCK') {
    decision = 'NEEDS_PROOF';
    reasons.push('LLM synthesis is not confident enough to support the decision');
  }

  if (!Number.isFinite(input.llmSynthesis.confidence) || input.llmSynthesis.confidence < 0 || input.llmSynthesis.confidence > 1) {
    decision = 'BLOCK';
    reasons.push('LLM synthesis confidence is invalid');
  }

  const base: Omit<FounderFinalDecisionReceipt, 'decisionId'> = {
    contract: FOUNDER_FINAL_DECISION_CONTRACT,
    decision,
    runId: input.runId.trim(),
    projectSlug: input.projectSlug.trim(),
    expectedHeadSha: expectedSha,
    fromStage: input.fromStage,
    toStage: input.toStage,
    n8nReceiptId: input.n8nReceiptId,
    pythonSummaryIds: uniqueSorted(input.pythonSummaries.map((summary) => summary.summaryId)),
    githubProofUrls: uniqueSorted(input.githubProof.proofUrls),
    reasons: uniqueSorted(reasons),
    authority: {
      advanceStage: false,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
  };

  return { decisionId: decisionId(base), ...base };
}
