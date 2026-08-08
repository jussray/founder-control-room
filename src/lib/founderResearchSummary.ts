import { createHash } from 'node:crypto';

export const FOUNDER_RESEARCH_SUMMARY_CONTRACT = 'founder-control-room/python-research-summary@v1' as const;
export const FOUNDER_RESEARCH_SUMMARY_PREFIX = 'fcr-python-summary-v1:' as const;

export interface FounderResearchSource {
  url: string;
  title: string;
}

export interface FounderResearchSummaryEnvelope {
  contract: typeof FOUNDER_RESEARCH_SUMMARY_CONTRACT;
  summaryId: string;
  runId: string;
  projectSlug: string;
  expectedHeadSha: string;
  scriptVersion: string;
  generatedAt: string;
  sources: FounderResearchSource[];
  claims: string[];
  contradictions: string[];
  confidence: number;
  recommendation: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedSources(values: readonly FounderResearchSource[]): FounderResearchSource[] {
  const byUrl = new Map<string, FounderResearchSource>();
  for (const source of values) {
    const url = source.url.trim();
    if (!url) continue;
    byUrl.set(url, { url, title: source.title.trim() });
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function founderResearchSummarySeed(summary: Omit<FounderResearchSummaryEnvelope, 'summaryId'>): string {
  return JSON.stringify([
    summary.contract,
    summary.runId.trim(),
    summary.projectSlug.trim(),
    summary.expectedHeadSha.trim().toLowerCase(),
    summary.scriptVersion.trim(),
    summary.generatedAt.trim(),
    normalizedSources(summary.sources).map((source) => [source.url, source.title]),
    uniqueSorted(summary.claims),
    uniqueSorted(summary.contradictions),
    Number(summary.confidence).toFixed(6),
    summary.recommendation.trim(),
  ]);
}

export function founderResearchSummaryId(summary: Omit<FounderResearchSummaryEnvelope, 'summaryId'>): string {
  return `${FOUNDER_RESEARCH_SUMMARY_PREFIX}${createHash('sha256').update(founderResearchSummarySeed(summary)).digest('hex')}`;
}

export function validateFounderResearchSummary(summary: FounderResearchSummaryEnvelope): string[] {
  const reasons: string[] = [];
  if (summary.contract !== FOUNDER_RESEARCH_SUMMARY_CONTRACT) reasons.push('unsupported research summary contract');
  if (!summary.runId.trim()) reasons.push('runId is required');
  if (!summary.projectSlug.trim()) reasons.push('projectSlug is required');
  if (!FULL_SHA.test(summary.expectedHeadSha.trim())) reasons.push('expectedHeadSha must be a full Git SHA');
  if (!summary.scriptVersion.trim()) reasons.push('scriptVersion is required');
  if (Number.isNaN(Date.parse(summary.generatedAt))) reasons.push('generatedAt must be an ISO-compatible timestamp');
  if (!Number.isFinite(summary.confidence) || summary.confidence < 0 || summary.confidence > 1) reasons.push('confidence must be between 0 and 1');
  if (!Array.isArray(summary.sources) || summary.sources.length === 0) reasons.push('at least one research source is required');
  if (summary.sources.some((source) => {
    try {
      return new URL(source.url).protocol !== 'https:';
    } catch {
      return true;
    }
  })) reasons.push('research sources must use HTTPS URLs');
  if (summary.summaryId !== founderResearchSummaryId(summary)) reasons.push('summaryId does not match summary evidence');
  return reasons;
}
