-- Sanitized intake-only receipts for Founder Signal review replies.
-- This ledger intentionally stores no raw email, sender address, recipient
-- address, quoted thread history, attachment, provider credential, Buffer
-- mutation result, customer data, or publication artifact.

CREATE TABLE IF NOT EXISTS public.founder_signal_review_email_receipts (
  ingress_id UUID PRIMARY KEY,
  reply_context_id UUID NOT NULL,
  message_ref_hash TEXT NOT NULL UNIQUE CHECK (message_ref_hash ~ '^[0-9a-f]{64}$'),
  raw_message_hash TEXT NOT NULL CHECK (raw_message_hash ~ '^[0-9a-f]{64}$'),
  sender_ref_hash TEXT NOT NULL CHECK (sender_ref_hash ~ '^[0-9a-f]{64}$'),
  recipient_ref_hash TEXT NOT NULL CHECK (recipient_ref_hash ~ '^[0-9a-f]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  command_type TEXT NOT NULL CHECK (
    command_type IN ('cancel_all', 'cancel_one', 'edit_one')
  ),
  target_channel TEXT CHECK (
    target_channel IS NULL OR target_channel ~ '^[a-z0-9][a-z0-9_-]{0,99}$'
  ),
  command_text TEXT NOT NULL CHECK (
    length(command_text) BETWEEN 1 AND 1000
  ),
  sender_verified BOOLEAN NOT NULL CHECK (sender_verified = TRUE),
  provider_actions_requested INTEGER NOT NULL CHECK (provider_actions_requested = 0),
  received_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source = 'cloudflare_email_routing'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (command_type = 'cancel_all' AND target_channel IS NULL)
    OR
    (command_type IN ('cancel_one', 'edit_one') AND target_channel IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS founder_signal_review_email_context_time_idx
  ON public.founder_signal_review_email_receipts (reply_context_id, received_at DESC);

CREATE INDEX IF NOT EXISTS founder_signal_review_email_command_time_idx
  ON public.founder_signal_review_email_receipts (command_type, received_at DESC);

ALTER TABLE public.founder_signal_review_email_receipts ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created. The signed backend ingest route
-- uses the server-side service-role client and returns only sanitized receipt
-- metadata. A later separately approved processor may read this ledger, but
-- this migration grants no Buffer, Zapier, Gmail, or publication authority.
