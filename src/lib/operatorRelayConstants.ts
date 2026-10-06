export const OPERATOR_RELAY_PEERS = ['gemini', 'codex', 'claude-code', 'perplexity', 'muse'] as const;
export const OPERATOR_RELAY_SOURCES = ['fcr', ...OPERATOR_RELAY_PEERS] as const;
export const OPERATOR_RELAY_INSTRUCTOR = 'deepseek-instructor' as const;
