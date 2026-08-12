-- Durable, sanitized correlation state for the Founder Signal 20-minute review window.
--
-- This bridge stores only the already-public scheduled social copy, Buffer schedule
-- identifiers, hashes of private addresses/tokens, exact source identity, and
-- provider-dispatch evidence. It stores no raw email, credentials, quoted mail,
-- customer/user data, attachments, or provider response bodies.

-- Historical intake receipts predate executable review commands. Keep their
-- capability hash NULL rather than inventing/backfilling authority. New runtime
-- receipts require the hash structurally before they can reach command execution.
ALTER TABLE public.founder_signal_review_email_receipts
  ADD COLUMN IF NOT EXISTS review_token_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'founder_signal_review_email_receipts_review_token_hash_check'
      AND conrelid = 'public.founder_signal_review_email_receipts'::regclass
  ) THEN
    ALTER TABLE public.founder_signal_review_email_receipts
      ADD CONSTRAINT founder_signal_review_email_receipts_review_token_hash_check
      CHECK (
        review_token_hash IS NULL
        OR review_token_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.founder_signal_review_email_receipts.review_token_hash IS
  'SHA-256 capability proof from the private review email subject. NULL historical rows are non-executable.';

CREATE TABLE IF NOT EXISTS public.founder_signal_review_contexts (
  reply_context_id UUID PRIMARY KEY,
  batch_id UUID NOT NULL UNIQUE,
  source_repo TEXT NOT NULL CHECK (
    source_repo ~ '^jussray/[A-Za-z0-9._-]{1,100}$'
  ),
  source_commit_sha TEXT NOT NULL CHECK (
    source_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  founder_sender_ref_hash TEXT NOT NULL CHECK (
    founder_sender_ref_hash ~ '^[0-9a-f]{64}$'
  ),
  reply_to_ref_hash TEXT NOT NULL CHECK (
    reply_to_ref_hash ~ '^[0-9a-f]{64}$'
  ),
  review_token_hash TEXT NOT NULL CHECK (
    review_token_hash ~ '^[0-9a-f]{64}$'
  ),
  review_deadline TIMESTAMPTZ NOT NULL,
  scheduled_posts JSONB NOT NULL CHECK (
    jsonb_typeof(scheduled_posts) = 'array'
    AND jsonb_array_length(scheduled_posts) BETWEEN 1 AND 3
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS founder_signal_review_context_deadline_idx
  ON public.founder_signal_review_contexts (review_deadline);

ALTER TABLE public.founder_signal_review_contexts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.founder_signal_review_contexts IS
  'Private review-window correlation state. No anon/authenticated policy is permitted.';

CREATE TABLE IF NOT EXISTS public.founder_signal_review_command_dispatches (
  ingress_id UUID PRIMARY KEY REFERENCES public.founder_signal_review_email_receipts(ingress_id) ON DELETE RESTRICT,
  reply_context_id UUID NOT NULL REFERENCES public.founder_signal_review_contexts(reply_context_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (
    idempotency_key ~ '^founder-review:[0-9a-f-]{36}$'
  ),
  provider_request_hash TEXT NOT NULL CHECK (
    provider_request_hash ~ '^[0-9a-f]{64}$'
  ),
  provider_actions_requested INTEGER NOT NULL CHECK (
    provider_actions_requested BETWEEN 1 AND 3
  ),
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'accepted', 'failed')
  ),
  provider_http_status INTEGER CHECK (
    provider_http_status IS NULL OR provider_http_status BETWEEN 100 AND 599
  ),
  provider_response_hash TEXT CHECK (
    provider_response_hash IS NULL OR provider_response_hash ~ '^[0-9a-f]{64}$'
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (
    attempts BETWEEN 0 AND 100
  ),
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (state = 'pending' AND provider_http_status IS NULL AND provider_response_hash IS NULL)
    OR
    (state = 'accepted' AND provider_http_status BETWEEN 200 AND 299 AND provider_response_hash IS NOT NULL)
    OR
    (state = 'failed')
  )
);

CREATE INDEX IF NOT EXISTS founder_signal_review_dispatch_context_idx
  ON public.founder_signal_review_command_dispatches (reply_context_id, created_at DESC);

CREATE INDEX IF NOT EXISTS founder_signal_review_dispatch_state_idx
  ON public.founder_signal_review_command_dispatches (state, updated_at DESC);

ALTER TABLE public.founder_signal_review_command_dispatches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.founder_signal_review_command_dispatches IS
  'Sanitized dispatch evidence only. A provider 2xx proves hook acceptance, never Buffer execution.';

-- Intentionally no anon/authenticated policies. The service-role backend is the
-- only writer/reader. Provider execution still requires a downstream correlated
-- receipt before Founder Control Room may claim a cancel/edit completed.
