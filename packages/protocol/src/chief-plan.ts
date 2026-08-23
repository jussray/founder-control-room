import { z } from 'zod';
import { ActorSchema } from './authority';
import { IsoDateTimeSchema, Strict, UuidSchema } from './common';

export const ChiefPlanSchema = Strict({
  protocolVersion: z.literal('1.0'),
  id: UuidSchema,
  requestId: UuidSchema,
  riskTier: z.enum(['L0','L1','L2','L3']),
  riskReasons: z.array(z.string().min(1)).min(1),
  workflowSequence: z.array(Strict({
    id: z.string().min(1),
    version: z.string().min(1),
    required: z.boolean(),
  })).min(1),
  allowedTools: z.array(z.string()).default([]),
  requiredEvidenceKinds: z.array(z.string()).default([]),
  authority: Strict({
    mode: z.enum(['observe_only','recommend_only','execute_approved']),
    approvalRequired: z.boolean(),
    requiredRoles: z.array(z.string()).default([]),
  }),
  stopConditions: z.array(z.string()).min(1),
  createdBy: ActorSchema,
  createdAt: IsoDateTimeSchema,
});

export type ChiefPlan = z.infer<typeof ChiefPlanSchema>;
