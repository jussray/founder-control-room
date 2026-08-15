import type { PublicSkillRoundDefinition } from "./model.js";

export const DEVIL_V1_ROUND: PublicSkillRoundDefinition = {
  campaignId: "devil-v1-20260815",
  skillName: "/devil",
  skillVersion: "1.0.0",
  proofPath: "skills/devil/SKILL.md",
  cta: "Comment DEVIL + one sentence describing the idea you're convinced will work.",
  testQuestion:
    "Can the skill surface a meaningful weakness without collapsing into generic negativity?",
  launchDate: "2026-08-15",
};

export const PUBLIC_SKILL_TEST_ROUNDS = [DEVIL_V1_ROUND] as const;
