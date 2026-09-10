import type {
  FirstSliceMove,
  FirstSlicePrivacyChoice,
  SensitiveCategory,
} from './firstSliceContracts.js';

export const FIRST_SLICE_INTENT_TAGS = [
  'money',
  'people',
  'build',
  'health',
  'kids',
  'legal',
  'rest',
  'general',
] as const;

export type FirstSliceIntentTag = (typeof FIRST_SLICE_INTENT_TAGS)[number];
export type RunnablePrivacyChoice = Exclude<FirstSlicePrivacyChoice, 'cancel'>;
export type FirstSliceMovePolicy = 'tiny' | 'protective' | 'clarifying';

export interface DeterministicFriendIntakeInput {
  rawText: string;
  privacyChoice: RunnablePrivacyChoice;
}

export interface DeterministicFriendIntakeResult {
  mirror: {
    headline: string;
    summary: string;
  };
  intentTags: FirstSliceIntentTag[];
  move: FirstSliceMove & { policy: FirstSliceMovePolicy };
  sensitiveCategories: SensitiveCategory[];
  redactedSummary: string | null;
}

const SENSITIVE_RULES: ReadonlyArray<{
  category: SensitiveCategory;
  patterns: readonly RegExp[];
}> = [
  {
    category: 'credentials',
    patterns: [
      /\bpassword\b/i,
      /\bpasscode\b/i,
      /\bapi[ -]?key\b/i,
      /\baccess[ -]?token\b/i,
      /\brefresh[ -]?token\b/i,
      /\bcredential(?:s)?\b/i,
      /\bsecret\b/i,
    ],
  },
  {
    category: 'legal',
    patterns: [
      /\blegal\b/i,
      /\blawyer\b/i,
      /\battorney\b/i,
      /\bcourt\b/i,
      /\blawsuit\b/i,
      /\bcustody\b/i,
    ],
  },
  {
    category: 'health',
    patterns: [
      /\bhealth\b/i,
      /\bmedical\b/i,
      /\bdiagnosis\b/i,
      /\bmedication\b/i,
      /\btherapy\b/i,
      /\bmental health\b/i,
      /\bcrisis\b/i,
      /\bself[ -]?harm\b/i,
      /\bsuicid(?:e|al)\b/i,
      /\b(?:kill|hurt|injure)\s+myself\b/i,
      /\b(?:want|wanna|going|gonna|plan(?:ning)?|intend(?:ing)?)\s+to\s+(?:kill|hurt|injure)\s+(?:myself|me)\b/i,
      /\b(?:want|wanna|going|gonna|plan(?:ning)?|intend(?:ing)?)\s+to\s+die\b/i,
      /\bdon['’]?t\s+want\s+to\s+(?:be\s+alive|live)\b/i,
    ],
  },
  {
    category: 'teen',
    patterns: [
      /\bchild\b/i,
      /\bteen\b/i,
      /\bminor\b/i,
      /\bson\b/i,
      /\bdaughter\b/i,
      /\bkid\b/i,
    ],
  },
  {
    category: 'family_conflict',
    patterns: [
      /\bfamily conflict\b/i,
      /\bcustody\b/i,
      /\bdivorce\b/i,
      /\babuse\b/i,
      /\brestraining order\b/i,
    ],
  },
];

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function classifySensitiveCategories(text: string): SensitiveCategory[] {
  return SENSITIVE_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.category);
}

function extractIntentTags(text: string, sensitiveCategories: readonly SensitiveCategory[]): FirstSliceIntentTag[] {
  const lower = text.toLowerCase();
  const tags: FirstSliceIntentTag[] = [];

  if (/\b(money|finance|budget|revenue|sale|customer|bank)\b/.test(lower)) tags.push('money');
  if (/\b(build|ship|code|project|product|launch|design|site|app)\b/.test(lower)) tags.push('build');
  if (/\b(person|people|team|partner|client|customer|friend|family)\b/.test(lower)) tags.push('people');
  if (/\b(rest|sleep|tired|pause|break)\b/.test(lower)) tags.push('rest');
  if (sensitiveCategories.includes('health')) tags.push('health');
  if (sensitiveCategories.includes('teen')) tags.push('kids');
  if (sensitiveCategories.includes('legal')) tags.push('legal');

  const bounded = unique(tags).slice(0, 3);
  return bounded.length > 0 ? bounded : ['general'];
}

function summaryFor(tags: readonly FirstSliceIntentTag[], sensitiveCategories: readonly SensitiveCategory[]): string {
  const visibleTags = tags.filter((tag) => tag !== 'general').slice(0, 2);
  const subject = visibleTags.length > 0 ? visibleTags.join(' and ') : 'general';

  if (sensitiveCategories.length > 0) {
    return `You shared a sensitive ${subject} situation. The first step is to protect context before taking action.`;
  }

  return `You want to move a ${subject} situation forward with one small, reversible next step.`;
}

function tinyMoveFor(tags: readonly FirstSliceIntentTag[]): FirstSliceMove & { policy: 'tiny' } {
  const primary = tags[0] ?? 'general';
  const actionText = primary === 'money'
    ? 'Write down the one money decision you can make in the next 10 minutes.'
    : primary === 'build'
      ? 'Write the first build step you can complete in the next 10 minutes.'
      : primary === 'people'
        ? 'Draft one sentence that clearly states what you need from the person involved.'
        : primary === 'rest'
          ? 'Set a 10-minute reset, then name the one thing you will return to afterward.'
          : 'Write the smallest next step you can finish in the next 10 minutes.';

  return {
    kind: 'tiny_move',
    text: actionText,
    timeEstimateMinutes: 10,
    gateWarning: null,
    policy: 'tiny',
  };
}

function protectiveMove(): FirstSliceMove & { policy: 'protective' } {
  return {
    kind: 'protective_move',
    text: 'Protect this context for now and decide whether you want to add only the minimum detail needed before taking action.',
    timeEstimateMinutes: 5,
    gateWarning: 'Sensitive input stays in a protective lane and does not trigger an external action.',
    policy: 'protective',
  };
}

export class FirstSliceEngine {
  run(input: DeterministicFriendIntakeInput): DeterministicFriendIntakeResult {
    const sensitiveCategories = classifySensitiveCategories(input.rawText);
    const intentTags = extractIntentTags(input.rawText, sensitiveCategories);
    const summary = summaryFor(intentTags, sensitiveCategories);
    const move = sensitiveCategories.length > 0
      ? protectiveMove()
      : tinyMoveFor(intentTags);

    return {
      mirror: {
        headline: sensitiveCategories.length > 0
          ? 'This needs a protected next step.'
          : 'Here is the shape of what you shared.',
        summary,
      },
      intentTags,
      move,
      sensitiveCategories,
      redactedSummary: input.privacyChoice === 'save_redacted_summary'
        ? summary.slice(0, 300)
        : null,
    };
  }
}
