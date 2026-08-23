import { z } from "zod";
import { IsoDateTimeSchema, Strict, UuidSchema } from "./common";

export const ActorSchema = Strict({
  type: z.enum(["human", "agent", "system", "service"]),
  id: z.string().min(1),
});

export const AuthorityDecisionSchema = Strict({
  id: UuidSchema,
  projectId: z.string().min(1),
  subjectRef: z.string().min(1),
  action: z.enum(["merge", "deploy", "rollback", "delete", "approve_execution"]),
  status: z.enum(["requested", "approved", "denied", "expired", "revoked"]),
  grantedTo: ActorSchema,
  grantedBy: ActorSchema.nullable(),
  rationale: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.nullable(),
}).superRefine((value, ctx) => {
  if (value.status === "approved" && value.grantedBy?.type !== "human") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only a human may approve protocol v1 authority." });
  }
});

export type AuthorityDecision = z.infer<typeof AuthorityDecisionSchema>;
