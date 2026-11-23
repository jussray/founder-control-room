import { describe, expect, it } from 'vitest';
import { parseRelayIntent } from '../operatorRelayIntent.js';

describe('parseRelayIntent', () => {
  it('routes Gemini as the front command operator', () => {
    expect(parseRelayIntent('Ask Gemini to plan the media route.', 'codex')).toEqual({
      target: 'gemini',
      instruction: 'plan the media route.',
    });
  });

  it('recognizes the founder shorthand used in conversation', () => {
    expect(parseRelayIntent('Tell Perplexity to attack that version.', 'codex')).toEqual({
      target: 'perplexity',
      instruction: 'attack that version.',
    });
  });

  it('routes to Claude without confusing the instructor lane', () => {
    expect(parseRelayIntent('Ask Claude to review this implementation.', 'codex')).toEqual({
      target: 'claude-code',
      instruction: 'review this implementation.',
    });
  });

  it('routes normal DeepSeek as a peer relay target', () => {
    expect(parseRelayIntent('Ask DeepSeek to review this implementation.', 'codex')).toEqual({
      target: 'deepseek',
      instruction: 'review this implementation.',
    });
  });

  it('routes Muse as a governed peer relay target', () => {
    expect(parseRelayIntent('Ask Muse to challenge this implementation.', 'codex')).toEqual({
      target: 'muse',
      instruction: 'challenge this implementation.',
    });
  });

  it('does not treat the DeepSeek Instructor identity as a peer relay target', () => {
    expect(parseRelayIntent('Ask DeepSeek Instructor to review this implementation.', 'codex')).toBeNull();
  });
});
