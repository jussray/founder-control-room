import { describe, expect, it } from 'vitest';
import { parseRelayIntent } from '../operatorRelayIntent.js';

describe('parseRelayIntent', () => {
  it('recognizes the founder shorthand used in conversation', () => {
    expect(parseRelayIntent('Tell Perplexity to attack that version.', 'codex')).toEqual({
      target: 'perplexity',
      instruction: 'to attack that version.',
    });
  });

  it('routes to Claude without confusing the instructor lane', () => {
    expect(parseRelayIntent('Ask Claude to review this implementation.', 'codex')).toEqual({
      target: 'claude-code',
      instruction: 'to review this implementation.',
    });
  });

  it('does not treat DeepSeek as a peer relay target', () => {
    expect(parseRelayIntent('Ask DeepSeek to review this implementation.', 'codex')).toBeNull();
  });
});
