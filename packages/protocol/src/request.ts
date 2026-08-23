import { z } from 'zod';
import { ActorSchema } from './authority';
import { Strict, IsoDateTimeSchema, UuidSchema } from './common';

export const FcrRequestSchema = Strict({
  protocolVersion: z.literal('1.0'),
  id: UuidSchema,
  type: z.enum(['decision.challenge','decision.create','incident.triage','release.review','research.request','workflow.run']),
  projectId: z.string().min(1),
  objective: z.string().min(8),
  subject: Strict({
    type: z.enum(['pull_request','branch','incident','decision','feature','architecture','freeform']),
    id: z.string().min(1),
    repository: z.string().optional(),
    ref: z.string().optional(),
    sha: z.string().optional(),
  }),
  requestedBy: ActorSchema,
  authority: Strict({
    mode: z.enum(['observe_only','recommend_only','execute_approved']),
    approvalRequired: z.boolean(),
    requiredRoles: z.array(z.string()).default([]),
  }),
  constraints: z.array(z.string()).default([]),
  createdAt: IsoDateTimeSchema,
});

export type FcrRequest = z.infer<typeof FcrRequestSchema>;
