import type { RelayOperatorId } from './operatorRelay.js';

const TARGETS: ReadonlyArray<{ id: RelayOperatorId; patterns: RegExp[] }> = [
  { id: 'gemini', patterns: [/\bgemini\b/i] },
  { id: 'perplexity', patterns: [/\bperplexity\b/i] },
  { id: 'deepseek', patterns: [/\bdeepseek\b/i] },
  { id: 'muse', patterns: [/\bmuse\b/i] },
  { id: 'claude-code', patterns: [/\bclaude(?:\s+code)?\b/i] },
  { id: 'codex', patterns: [/\b(?:chatgpt|codex)\b/i] },
];

const DEEPSEEK_INSTRUCTOR_PATTERN = /\bdeepseek\s+instructor\b/i;

export interface RelayIntent {
  target: RelayOperatorId;
  instruction: string;
}

function targetPattern(target: RelayOperatorId): RegExp {
  switch (target) {
    case 'gemini': return /\bgemini\b/i;
    case 'claude-code': return /\bclaude(?:\s+code)?\b/i;
    case 'codex': return /\b(?:chatgpt|codex)\b/i;
    case 'perplexity': return /\bperplexity\b/i;
    case 'deepseek': return /\bdeepseek\b/i;
    case 'muse': return /\bmuse\b/i;
  }
}

export function parseRelayIntent(input: string, activeOperator: RelayOperatorId): RelayIntent | null {
  const text = input.trim();
  if (!text) return null;

  const delegation = /^(?:tell|ask|send|relay(?:\s+this)?\s+to|have)\s+/i.test(text);
  if (!delegation) return null;

  // DeepSeek Instructor is a distinct adversary/instructor identity and must
  // never be collapsed into the normal DeepSeek peer lane by shorthand parsing.
  if (DEEPSEEK_INSTRUCTOR_PATTERN.test(text)) return null;

  const target = TARGETS.find(({ id, patterns }) => id !== activeOperator && patterns.some((pattern) => pattern.test(text)))?.id;
  if (!target) return null;

  const instruction = text
    .replace(/^(?:tell|ask|send|relay(?:\s+this)?\s+to|have)\s+/i, '')
    .replace(targetPattern(target), '')
    .replace(/^\s*(?:to\s+)?/i, '')
    .trim();

  return instruction ? { target, instruction } : null;
}
