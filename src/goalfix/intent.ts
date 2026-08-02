export type GoalfixIntentConfidence = 'high' | 'medium' | 'low';

export interface GoalfixIntent {
  raw: string;
  resolved: string;
  confidence: GoalfixIntentConfidence;
  assumptions: string[];
}

export interface ResolveGoalfixIntentInput {
  raw: string;
  resolved?: string;
  assumptions?: string[];
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function resolveGoalfixIntent(input: ResolveGoalfixIntentInput): GoalfixIntent {
  const raw = normalizeWhitespace(input.raw);
  const resolved = normalizeWhitespace(input.resolved ?? input.raw);
  const assumptions = [...new Set((input.assumptions ?? []).map(normalizeWhitespace).filter(Boolean))];

  let confidence: GoalfixIntentConfidence = 'high';
  if (!raw || !resolved) confidence = 'low';
  else if (assumptions.length > 0 || raw.toLocaleLowerCase('en-US') !== resolved.toLocaleLowerCase('en-US')) {
    confidence = 'medium';
  }

  return { raw, resolved, confidence, assumptions };
}
