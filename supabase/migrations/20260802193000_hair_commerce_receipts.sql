-- Sanitized Juss Beautiful Hair commerce receipts.
-- This ledger intentionally stores no customer identity, address, vendor identity,
-- sourcing cost, margin, catalog payload, or fulfillment contact details.

CREATE TABLE IF NOT EXISTS public.hair_commerce_receipts (
  receipt_id UUID PRIMARY KEY,
  source_repo TEXT NOT NULL CHECK (source_repo = 'jussray/jbh-private'),
  order_ref_hash TEXT NOT NULL CHECK (order_ref_hash ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'paid_order_recorded',
      'vendor_review_required',
      'vendor_groups_ready',
      'owner_approved',
      'fulfillment_queued',
      'fulfillment_dispatched',
      'tracking_received',
      'completed',
      'exception'
    )
  ),
  group_count INTEGER NOT NULL CHECK (group_count BETWEEN 0 AND 1000),
  unresolved_count INTEGER NOT NULL CHECK (unresolved_count BETWEEN 0 AND 1000),
  occurred_at TIMESTAMPTZ NOT NULL,
  exact_commit_sha TEXT NOT NULL CHECK (exact_commit_sha ~ '^[0-9a-f]{40}$'),
  evidence_url TEXT CHECK (
    evidence_url IS NULL OR evidence_url ~ '^https://github\.com/'
  ),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hair_commerce_receipts_order_time_idx
  ON public.hair_commerce_receipts (order_ref_hash, occurred_at DESC);

CREATE INDEX IF NOT EXISTS hair_commerce_receipts_event_time_idx
  ON public.hair_commerce_receipts (event_type, occurred_at DESC);

ALTER TABLE public.hair_commerce_receipts ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created. The remote ingest route uses the
-- server-side service-role client and returns only the accepted receipt id/event.
