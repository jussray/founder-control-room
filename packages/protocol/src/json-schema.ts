import { z } from "zod";
import {
  AuthorityDecisionSchema,
  ChiefPlanSchema,
  DecisionEventSchema,
  DecisionSchema,
  EvidenceReferenceSchema,
  FcrRequestSchema,
  WitnessEventSchema,
} from "./index.js";

export const ProtocolJsonSchemas = {
  authorityDecision: z.toJSONSchema(AuthorityDecisionSchema),
  chiefPlan: z.toJSONSchema(ChiefPlanSchema),
  decision: z.toJSONSchema(DecisionSchema),
  decisionEvent: z.toJSONSchema(DecisionEventSchema),
  evidenceReference: z.toJSONSchema(EvidenceReferenceSchema),
  fcrRequest: z.toJSONSchema(FcrRequestSchema),
  witnessEvent: z.toJSONSchema(WitnessEventSchema),
} as const;
