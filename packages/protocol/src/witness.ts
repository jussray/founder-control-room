import { z } from "zod";
import { ActorSchema } from "./authority";
import { EvidenceReferenceSchema } from "./evidence";
import { IsoDateTimeSchema, ProtocolVersionSchema, Strict, UuidSchema } from "./common";

const WitnessActorSchema = ActorSchema.refine((actor) => actor.type !== "agent");

export const WitnessEventSchema = Strict({
  protocolVersion: ProtocolVersionSchema,
  id: UuidSchema,
  type: z.enum(["ci.completed", "test.passed", "test.failed", "deployment.healthy", "merge.completed"]),
  projectId: z.string().min(1),
  subjectRef: z.string().min(1),
  statement: z.string().min(1),
  witnessedBy: WitnessActorSchema,
  evidence: EvidenceReferenceSchema,
  observedAt: IsoDateTimeSchema,
  recordedAt: IsoDateTimeSchema.optional(),
  correlationId: UuidSchema,
  causationId: UuidSchema.nullable().optional(),
});

export type WitnessEvent = z.infer<typeof WitnessEventSchema>;
