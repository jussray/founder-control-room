import { z } from 'zod';
import { EvidenceReferenceSchema } from './evidence';
import { IsoDateTimeSchema, Strict, UuidSchema } from './common';

export const DecisionSchema = Strict({
  id: UuidSchema,
  requestId: UuidSchema,
  recommendation: z.enum(['proceed','proceed_with_controls','blocked','needs_human_decision']),
  confidence: z.enum(['low','medium','high']),
  summary: z.string().min(1),
  evidenceRefs: z.array(EvidenceReferenceSchema).default([]),
  createdAt: IsoDateTimeSchema,
});

export type Decision = z.infer<typeof DecisionSchema>;
