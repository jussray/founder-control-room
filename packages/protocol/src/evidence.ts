import { z } from "zod";
import { IsoDateTimeSchema, Strict, UuidSchema } from "./common";

export const EvidenceReferenceSchema = Strict({
  id: UuidSchema,
  kind: z.enum(["git_commit", "github_pull_request", "ci_run", "test_artifact", "deployment", "runtime_log", "human_attestation"]),
  source: z.enum(["git", "github", "cloudflare", "supabase", "manual", "internal"]),
  uri: z.string().min(1),
  label: z.string().min(1),
  observedAt: IsoDateTimeSchema,
  capturedAt: IsoDateTimeSchema,
  producedBy: Strict({
    type: z.enum(["external_system", "human", "agent", "service"]),
    id: z.string().min(1),
  }),
});

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
