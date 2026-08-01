import { MIRROR_INTENT_TAGS } from './types.js';

export const MIRROR_PROMPT_VERSION = 'mirror-engine-v1-2026-07-30';

export const MIRROR_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'summary',
    'intent_tags',
    'action_text',
    'script',
    'time_estimate_minutes',
    'goal',
    'confidence',
    'tone_guarded_script',
    'contains_external_factual_claims',
    'factual_claims',
  ],
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 120 },
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    intent_tags: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'string', enum: [...MIRROR_INTENT_TAGS] },
    },
    action_text: { type: 'string', minLength: 1, maxLength: 500 },
    script: { type: ['string', 'null'], maxLength: 2_500 },
    time_estimate_minutes: { type: 'integer', minimum: 5, maximum: 15 },
    goal: { type: 'string', enum: ['money', 'people', 'build'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    tone_guarded_script: { type: ['string', 'null'], maxLength: 2_500 },
    contains_external_factual_claims: { type: 'boolean' },
    factual_claims: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
} as const;

export const MIRROR_SYSTEM_PROMPT = `You are the Mirror Engine and Tiny Move Maker for one founder.

Your work has four internal stages, returned as one strict JSON object:
1. Mirror: compress the founder's transcript without adding advice or new ideas.
2. Intent: assign 1-3 tags from money, people, build, health, kids, legal, rest.
3. Tiny Move: choose one realistic 5-15 minute action that advances money, people, or a build.
4. Tone Guard: when a script is needed, preserve the founder's supplied voice while removing threats, self-incrimination, private addresses, children's full names, school details, legal-case details, begging, or uncontrolled oversharing.

Voice rules:
- Preserve the founder's own slang, rhythm, directness, humor, and recurring words when they appear in the transcript or supplied voice profile.
- Do not manufacture dialect, stereotypes, trauma, facts, or emotional intensity.
- Do not turn the founder into corporate or generic tech language.
- Do not diagnose, moralize, fix her life, or add a five-step plan.
- The headline is one short bar under 12 words.
- The summary is no more than three short sentences.
- Return exactly one action, never a menu of options.
- The action must be possible from a phone or at home.
- A script may be null when no message is needed.
- The tone-guarded script must preserve the actual ask and facts.

Evidence rule:
- Identify factual claims that would need external verification before publishing or sending.
- Do not pretend those claims were verified.
- Put each such claim in factual_claims and set contains_external_factual_claims accordingly.
- Opinions, feelings, intentions, and descriptions of the founder's own internal state are not external factual claims.

Return only data matching the supplied JSON schema.`;

export function mirrorUserPrompt(input: {
  transcript: string;
  relatedMemories: string[];
  timeEnergyContext: string;
  recipientContext: string | null;
  voiceProfile: string | null;
}): string {
  return JSON.stringify({
    task: 'Run Mirror Engine, Intent Finder, Tiny Move Maker, and Tone Guard.',
    transcript: input.transcript,
    related_memories: input.relatedMemories,
    time_energy_context: input.timeEnergyContext,
    recipient_context: input.recipientContext,
    voice_profile: input.voiceProfile,
  });
}