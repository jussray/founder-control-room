import type { RelayOperatorId } from './operatorRelay.js';

const TARGETS: ReadonlyArray<{ id: RelayOperatorId; patterns: RegExp[] }> = [
  { id: 'perplexity', patterns: [/\bperplexity\b/i] },
  { id: 'claude-code', patterns: [/\bclaude(?:\s+code)?\b/i] },
  { id: 'codex', patterns: [/\b(?:chatgpt|codex)\b/i] },
];

export interface RelayIntent {
  target: RelayOperatorId;
  instruction: string;
}

export function parseRelayIntent(input: string, activeOperator: RelayOperatorId): RelayIntent | null {
  const text = input.trim();
  if (!text) return null;

  const delegation = /^(?:tell|ask|send|relay(?:\s+this)?\s+to|have)\s+/i.test(text);
  if (!delegation) return null;

  const target = TARGETS.find(({ id, patterns }) => id !== activeOperator && patterns.some((pattern) => pattern.test(text)))?.id;
  if (!target) return null;

  const instruction = text
    .replace(/^(?:tell|ask|send|relay(?:\s+this)?\s+to|have)\s+/i, '')
    .replace(target === 'claude-code' ? /\bclaude(?:\s+code)?\b/i : target === 'codex' ? /\b(?:chatgpt|codex)\b/i : /\bperplexity\b/i, '')
    .replace(/^\s*(?:to\s+)?/i, '')
    .trim();

  return instruction ? { target, instruction } : null;
}
