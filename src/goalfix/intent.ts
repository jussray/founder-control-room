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
  const sameMeaningText = raw.toLocaleLowerCase('en-US') === resolved.toLocaleLowerCase('en-US');
  const interpretedResolution = explicitResolution && !sameMeaningText;

  // Supplying alternative wording is not itself founder confirmation. A
  // semantic rewrite must carry both an explicit confirmation and the
  // assumptions that explain the interpretation. This prevents automatic
  // callers from silently replacing the founder's requested outcome by
  // setting `resolved` and treating that field as authority.
  const confirmed = interpretedResolution
    ? input.confirmed === true && assumptions.length > 0
    : input.confirmed === true || explicitResolution;

  let confidence: GoalfixIntentConfidence = 'low';
  if (raw && resolved && confirmed) {
    if (assumptions.length > 0 || !sameMeaningText) {
      confidence = 'medium';
    } else {
      confidence = 'high';
    }
  }

  return { raw, resolved, confidence, assumptions, confirmed };
}
