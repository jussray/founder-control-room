import { z } from 'zod';

export const eventEnvelopeSchema = z.object({
  source: z.enum(['github', 'supabase', 'cloudflare', 'manual']),
  lane: z.enum(['founder-os', 'sekret-bip', 'partner-project']),
  type: z.string().min(1),
  payload: z.record(z.any()).default({}),
  observedAt: z.string().datetime().optional()
});

export const missionRequestSchema = z.object({
  lane: z.enum(['founder-os', 'sekret-bip', 'partner-project']),
  target: z.string().min(1),
  objective: z.string().min(1),
  definitionOfDone: z.array(z.string()).min(1),
  rollback: z.array(z.string()).min(1)
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type MissionRequest = z.infer<typeof missionRequestSchema>;
