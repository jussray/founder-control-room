export const PUBLIC_SKILL_TEST_OUTCOMES = [
  "useful",
  "misunderstood",
  "false-positive",
  "false-negative",
  "too-generic",
  "overcautious",
  "undercautious",
  "evidence-gap",
  "out-of-scope",
  "blocked",
] as const;

export type PublicSkillTestOutcome = (typeof PUBLIC_SKILL_TEST_OUTCOMES)[number];

export type PublicSkillVerdict =
  | "proceed"
  | "revise"
  | "test"
  | "defer"
  | "reject"
  | "not-applicable";

export type DecisionImpact = "yes" | "partial" | "no" | "unknown";
export type TesterUsefulness = "yes" | "no" | "unknown";

export interface PublicSkillTestReceipt {
  campaignId: string;
  testId: string;
  submittedAt: string;
  platform: string;
  validTest: boolean;
  outcome: PublicSkillTestOutcome;
  verdict: PublicSkillVerdict;
  decisionChanged: DecisionImpact;
  testerFoundUseful: TesterUsefulness;
  vNextCandidate: boolean;
  publicSafe: boolean;
  /** Stable anonymized identifier used only to measure repeat participation. */
  testerKey?: string;
  /** Hash or private evidence reference. Do not store raw private submissions here. */
  submissionRef?: string;
  sanitizedSummary?: string;
}

export interface PublicSkillRoundDefinition {
  campaignId: string;
  skillName: string;
  skillVersion: string;
  proofPath: string;
  cta: string;
  testQuestion: string;
  launchDate: string;
}
