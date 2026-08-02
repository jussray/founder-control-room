export type GoalfixIntentConfidence = 'high' | 'medium' | 'low';

export interface GoalfixIntent {
  raw: string;
  resolved: string;
  confidence: GoalfixIntentConfidence;
  assumptions: string[];
  confirmed: boolean;
}

export interface ResolveGoalfixIntentInput {
  raw: string;
  resolved?: string;
  assumptions?: string[];
  confirmed?: boolean;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function resolveGoalfixIntent(input: ResolveGoalfixIntentInput): GoalfixIntent {
  const raw = normalizeWhitespace(input.raw);
  const resolved = normalizeWhitespace(input.resolved ?? input.raw);
  const assumptions = [...new Set((input.assumptions ?? []).map(normalizeWhitespace).filter(Boolean))];
  const explicitResolution = input.resolved !== undefined;
  const confirmed = input.confirmed === true || explicitResolution;

  let confidence: GoalfixIntentConfidence = 'low';
  if (raw && resolved) {
    if (
      assumptions.length > 0
      || raw.toLocaleLowerCase('en-US') !== resolved.toLocaleLowerCase('en-US')
    ) {
      confidence = 'medium';
    } else if (confirmed) {
      confidence = 'high';
    }
  }

  return { raw, resolved, confidence, assumptions, confirmed };
}
