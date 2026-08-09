-- Sanitized downstream proof-of-ship receipts.
-- This table stores only immutable publication proof. It intentionally does not
-- store the LinkedIn post body, private repository content, credentials, or user data.

CREATE TABLE IF NOT EXISTS public.proof_of_ship_receipts (
  receipt_id UUID PRIMARY KEY,
  source_runtime TEXT NOT NULL CHECK (source_runtime = 'zapier'),
  source_repo TEXT NOT NULL CHECK (source_repo ~ '^jussray/[A-Za-z0-9._-]{1,100}$'),
  exact_commit_sha TEXT NOT NULL CHECK (exact_commit_sha ~ '^[0-9a-f]{40}$'),
  idempotency_key TEXT NOT NULL UNIQUE,
  linkedin_baseline_ref TEXT NOT NULL CHECK (
    length(linkedin_baseline_ref) BETWEEN 1 AND 200
    AND linkedin_baseline_ref LIKE 'linkedin-export:%'
  ),
  linkedin_rising_floor_ready BOOLEAN NOT NULL CHECK (linkedin_rising_floor_ready = TRUE),
  linkedin_growth_hypothesis TEXT NOT NULL CHECK (length(linkedin_growth_hypothesis) BETWEEN 1 AND 1200),
  linkedin_24h_gate TEXT NOT NULL CHECK (length(linkedin_24h_gate) BETWEEN 1 AND 600),
  linkedin_48h_gate TEXT NOT NULL CHECK (length(linkedin_48h_gate) BETWEEN 1 AND 600),
  linkedin_next_mutation TEXT NOT NULL CHECK (length(linkedin_next_mutation) BETWEEN 1 AND 1200),
  linkedin_draft_sha256 TEXT NOT NULL CHECK (linkedin_draft_sha256 ~ '^[0-9a-f]{64}$'),
  buffer_terminal_action TEXT NOT NULL CHECK (buffer_terminal_action = 'schedule'),
  buffer_schedule_id TEXT NOT NULL CHECK (
    length(buffer_schedule_id) BETWEEN 1 AND 200
    AND buffer_schedule_id ~ '^[A-Za-z0-9._:-]+$'
  ),
  scheduled_at TIMESTAMPTZ NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (idempotency_key = source_repo || ':' || exact_commit_sha)
);

CREATE INDEX IF NOT EXISTS proof_of_ship_receipts_commit_idx
  ON public.proof_of_ship_receipts (source_repo, exact_commit_sha);

CREATE INDEX IF NOT EXISTS proof_of_ship_receipts_occurred_idx
  ON public.proof_of_ship_receipts (occurred_at DESC);

ALTER TABLE public.proof_of_ship_receipts ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created. The remote callback and lookup
-- routes use the server-side service-role client and a private receipt token.
